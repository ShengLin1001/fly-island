//! One host's tunnel: a resident `ssh -N -R 127.0.0.1:<there>:127.0.0.1:<here>`, started again
//! with a backoff whenever it ends, until its stop channel is dropped. It connects through a
//! config of the island's own, `<app data>/ssh/tunnel-<host>.conf` from `ssh -G` with the user's
//! tunnels left out (agent_status/remote_fetch.rs `island_config`): ClearAllForwardings would
//! clear the `-R` given here too. ssh and whatever it starts (a ProxyCommand) run in a job
//! object, so stopping the tunnel or the island ending leaves no ssh behind.

use std::{
    io::{BufRead, BufReader},
    os::windows::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
    sync::{mpsc, Arc, Mutex, PoisonError},
    thread,
    time::{Duration, Instant},
};

use crate::{
    agent_status::{remote_fetch::write_island_config, remote_hosts::SshTarget},
    system::CREATE_NO_WINDOW,
    win32::job::{self, Job},
};

/// How a tunnel is doing. Mirrored by `SshTunnelState` in src/features/ssh-tunnel/api.ts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Status {
    Connecting,
    Connected,
    /// The server would not listen on the port: taken there, likely by another tunnel.
    PortInUse,
    Failed(String),
}

/// What one tunnel is told to keep up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Spec {
    pub(super) host: String,
    pub(super) target: SshTarget,
    pub(super) remote_port: u16,
    pub(super) local_port: u16,
}

/// How often the tunnel looks whether ssh ended or it was stopped.
const POLL: Duration = Duration::from_millis(250);
/// A tunnel up this long that then drops starts the backoff over.
const STABLE: Duration = Duration::from_secs(60);
const FIRST_RETRY_SECONDS: u64 = 5;
/// Each retry is a login to the server; more often could look like an attack there.
const MAX_RETRY_SECONDS: u64 = 120;

/// The wait before retrying after `failures` ends in a row: 5 s, doubling up to two minutes.
pub(super) fn backoff(failures: u32) -> Duration {
    let doublings = failures.saturating_sub(1).min(8);
    Duration::from_secs((FIRST_RETRY_SECONDS << doublings).min(MAX_RETRY_SECONDS))
}

/// ssh's arguments after `-F <config>`. `-v` makes ssh say when the server accepted the forward;
/// a refused one ends it (ExitOnForwardFailure) rather than leave a tunnel that carries nothing.
pub(super) fn ssh_args(remote_port: u16, local_port: u16, destination: &str) -> Vec<String> {
    let options = [
        "BatchMode=yes",
        "ConnectTimeout=10",
        "ServerAliveInterval=10",
        "ServerAliveCountMax=3",
        "ExitOnForwardFailure=yes",
    ];
    let mut args = vec!["-N".to_string(), "-T".to_string(), "-v".to_string()];
    for option in options {
        args.extend(["-o".to_string(), option.to_string()]);
    }
    args.extend([
        "-R".to_string(),
        format!("127.0.0.1:{remote_port}:127.0.0.1:{local_port}"),
        "--".to_string(),
        destination.to_string(),
    ]);
    args
}

/// What one line of ssh's stderr means for the tunnel.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Heard {
    Up,
    PortTaken,
    /// Something a person would read as the reason it ended.
    Said(String),
    Noise,
}

pub(super) fn hear(line: &str) -> Heard {
    let line = line.trim();
    if line.contains("remote forward success") {
        Heard::Up
    } else if line.contains("remote port forwarding failed") {
        Heard::PortTaken
    } else if line.is_empty() || line.starts_with("debug") || line.starts_with("OpenSSH") || line.starts_with("**") {
        Heard::Noise
    } else {
        Heard::Said(line.to_string())
    }
}

/// Run on the host (`sh -s`): its listening TCP ports. `ss` and `netstat` sit in /usr/sbin on
/// some servers (CentOS 7), outside a plain login's PATH.
pub(super) const PORT_CHECK_SCRIPT: &str =
    "PATH=\"$PATH:/usr/sbin:/sbin\"\nss -ltn 2>/dev/null || netstat -ltn 2>/dev/null || echo FOCUSD_NO_PORT_TOOL\n";

/// Whether `port` is listed as listening in what PORT_CHECK_SCRIPT printed. Both tools give the
/// local address as `<address>:<port>` (`127.0.0.1:10089`, `[::1]:10089`, `:::10089`); peers of
/// listeners end in `:*`.
pub(super) fn port_listening(output: &str, port: u16) -> Result<bool, String> {
    if output.contains("FOCUSD_NO_PORT_TOOL") {
        return Err("Neither ss nor netstat runs on the server".into());
    }
    let suffix = format!(":{port}");
    Ok(output.lines().any(|line| line.split_whitespace().any(|field| field.ends_with(&suffix))))
}

/// What a run of ssh learned before it ended.
#[derive(Default)]
struct Run {
    up: bool,
    port_taken: bool,
    said: String,
}

fn set(status: &Mutex<Status>, next: Status) {
    *status.lock().unwrap_or_else(PoisonError::into_inner) = next;
}

/// Keeps `spec`'s tunnel up until `stop`'s sender is dropped; `status` says how it is doing.
pub(super) fn supervise(app_dir: &Path, spec: &Spec, status: &Mutex<Status>, stop: &mpsc::Receiver<()>) {
    let mut failures = 0u32;
    loop {
        set(status, Status::Connecting);
        let started = Instant::now();
        let Some((ended, was_up)) = run_once(app_dir, spec, status, stop) else { return };
        if was_up && started.elapsed() >= STABLE {
            failures = 0;
        }
        failures = failures.saturating_add(1);
        set(status, ended);
        if !matches!(stop.recv_timeout(backoff(failures)), Err(mpsc::RecvTimeoutError::Timeout)) {
            return;
        }
    }
}

/// One ssh, from start to end: how it ended and whether it had been up; None when stopped.
fn run_once(app_dir: &Path, spec: &Spec, status: &Mutex<Status>, stop: &mpsc::Receiver<()>) -> Option<(Status, bool)> {
    let failed = |error: String| Some((Status::Failed(error), false));
    let config = match write_island_config(app_dir, &format!("tunnel-{}", spec.host), &spec.target, None) {
        Ok(config) => config,
        Err(error) => return failed(error),
    };
    let mut child = match Command::new("ssh")
        .arg("-F")
        .arg(&config)
        .args(ssh_args(spec.remote_port, spec.local_port, &spec.target.destination))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW | job::START_SUSPENDED)
        .spawn()
    {
        Ok(child) => child,
        Err(error) => return failed(format!("Failed to start ssh: {error}")),
    };
    // Started suspended, so a ProxyCommand it starts is in the job too. Dropped on return.
    let _job = match Job::new().and_then(|job| job.assign(&child).map(|()| job)).and_then(|job| job::resume(child.id()).map(|()| job)) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return failed(error);
        }
    };
    let run = Arc::new(Mutex::new(Run::default()));
    if let Some(stderr) = child.stderr.take() {
        let run = Arc::clone(&run);
        // Read all along: `-v` talks on every forwarded connection, and a full pipe would stall ssh.
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut run = run.lock().unwrap_or_else(PoisonError::into_inner);
                match hear(&line) {
                    Heard::Up => run.up = true,
                    Heard::PortTaken => run.port_taken = true,
                    Heard::Said(said) => run.said = said,
                    Heard::Noise => {}
                }
            }
        });
    }
    let mut shown_up = false;
    loop {
        if !matches!(stop.recv_timeout(POLL), Err(mpsc::RecvTimeoutError::Timeout)) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        if !shown_up && run.lock().unwrap_or_else(PoisonError::into_inner).up {
            shown_up = true;
            set(status, Status::Connected);
        }
        match child.try_wait() {
            Ok(None) => continue,
            Ok(Some(exit)) => {
                // The reader takes in ssh's last words just after it ends.
                thread::sleep(Duration::from_millis(150));
                let run = run.lock().unwrap_or_else(PoisonError::into_inner);
                let ended = if run.port_taken {
                    Status::PortInUse
                } else {
                    let code = exit.code().map_or_else(|| "was stopped".to_string(), |code| format!("exited with {code}"));
                    Status::Failed(if run.said.is_empty() { format!("ssh {code}") } else { format!("ssh {code}: {}", run.said) })
                };
                return Some((ended, run.up));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return failed(format!("Lost track of ssh: {error}"));
            }
        }
    }
}
