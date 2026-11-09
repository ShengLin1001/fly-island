//! Feishu's part of the setup, done by cc-connect itself: `cc-connect feishu new` shows a QR code
//! that, scanned in the Feishu app, makes the bot app, writes its credentials into the project
//! the island added, and puts whoever scanned into `allow_from`. It runs hidden; the plugin page
//! shows the QR code (cc-connect saves it as a PNG) and asks here how it goes. Failed or
//! cancelled, the project the island added is taken out of the config again.

use crate::user_error::UserError;
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;

use super::{config_file, locate::FOLDER};
use crate::{
    system::CREATE_NO_WINDOW,
    win32::job::{self, Job},
};

/// How it is going, for the plugin page. Mirrored by `CcConnectFeishuSetup` in src/features/cc-connect/api.ts.
#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FeishuProgress {
    running: bool,
    /// The QR code as a `data:image/png` URL, while waiting for the scan.
    qr: Option<String>,
    /// What the QR code opens, for a phone that cannot scan the screen.
    url: Option<String>,
    done: bool,
    allow_from: Option<String>,
    error: Option<UserError>,
}

struct Setup {
    child: Child,
    _job: Job,
    output: Arc<Mutex<Vec<String>>>,
    qr: PathBuf,
    config: PathBuf,
    /// The config before the project was added, to put back.
    original: Option<String>,
    ended: Option<Result<(), UserError>>,
}

fn setup() -> MutexGuard<'static, Option<Setup>> {
    static SETUP: OnceLock<Mutex<Option<Setup>>> = OnceLock::new();
    SETUP.get_or_init(Mutex::default).lock().unwrap_or_else(PoisonError::into_inner)
}

/// Adds `project` (with an empty Feishu platform) and starts the QR setup in it.
pub(super) fn start(exe: &Path, config: &Path, project: &config_file::NewProject, app_dir: &Path, today: &str, stamp: &str) -> Result<(), UserError> {
    let mut current = setup();
    if current.as_ref().is_some_and(|setup| setup.ended.is_none()) {
        return Err(UserError::new("ccConnect.feishuRunning", "A Feishu QR setup is already running."));
    }
    let original = config_file::add_project(config, project, today, stamp)?;
    let qr = app_dir.join(FOLDER).join("feishu-qr.png");
    let _ = fs::remove_file(&qr);
    let started = spawn(exe, config, project.name, &qr);
    let (mut child, job) = match started {
        Ok(started) => started,
        Err(error) => {
            let _ = config_file::restore(config, original.as_deref());
            return Err(error);
        }
    };
    let output = Arc::new(Mutex::new(Vec::new()));
    for pipe in [child.stdout.take().map(|pipe| Box::new(pipe) as Box<dyn Read + Send>), child.stderr.take().map(|pipe| Box::new(pipe) as _)]
        .into_iter()
        .flatten()
    {
        let output = Arc::clone(&output);
        thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                if let Some(line) = worth_keeping(&line) {
                    output.lock().unwrap_or_else(PoisonError::into_inner).push(line);
                }
            }
        });
    }
    *current = Some(Setup { child, _job: job, output, qr, config: config.to_path_buf(), original, ended: None });
    // Settles the end even with the plugin page closed meanwhile.
    thread::spawn(|| loop {
        thread::sleep(Duration::from_secs(1));
        match setup().as_mut() {
            Some(setup) if setup.ended.is_none() => settle(setup),
            _ => return,
        }
    });
    Ok(())
}

fn spawn(exe: &Path, config: &Path, project: &str, qr: &Path) -> Result<(Child, Job), UserError> {
    if let Some(dir) = qr.parent() {
        fs::create_dir_all(dir).map_err(|error| UserError::new("file.create", format!("Could not create {}.", dir.display())).arg("path", dir.display().to_string()).detail(error))?;
    }
    let mut child = Command::new(exe)
        .args(["feishu", "new", "--config"])
        .arg(config)
        .args(["--project", project, "--qr-image"])
        .arg(qr)
        .arg("--set-allow-from-empty")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW | job::START_SUSPENDED)
        .spawn()
        .map_err(|error| UserError::new("ccConnect.run", "Could not run cc-connect.").detail(error))?;
    match Job::new().and_then(|job| job.assign(&child).map(|()| job)).and_then(|job| job::resume(child.id()).map(|()| job)) {
        Ok(job) => Ok((child, job)),
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(UserError::new("ccConnect.run", "Could not run cc-connect.").detail(error))
        }
    }
}

/// A line of cc-connect's output, unless it is part of the QR code drawn in blocks or empty.
fn worth_keeping(line: &str) -> Option<String> {
    let line = line.trim();
    let drawn = line.chars().any(|ch| matches!(ch, '█' | '▀' | '▄'));
    (!line.is_empty() && !drawn).then(|| line.to_string())
}

/// Once cc-connect ended: puts the config back unless it succeeded, and restarts the island's
/// cc-connect if it did, so the new bot comes up.
fn settle(setup: &mut Setup) {
    let Ok(Some(exit)) = setup.child.try_wait() else { return };
    // The readers take in cc-connect's last words just after it ends.
    thread::sleep(Duration::from_millis(150));
    let output = setup.output.lock().unwrap_or_else(PoisonError::into_inner).clone();
    let succeeded = exit.success() && output.iter().any(|line| line.starts_with('✅'));
    setup.ended = Some(if succeeded { Ok(()) } else { Err(failure(&output)) });
    if succeeded {
        super::runner::restart();
    } else {
        let _ = config_file::restore(&setup.config, setup.original.as_deref());
    }
    let _ = fs::remove_file(&setup.qr);
}

/// Where the setup is.
pub(super) fn progress() -> FeishuProgress {
    let mut current = setup();
    let Some(setup) = current.as_mut() else { return FeishuProgress::default() };
    if setup.ended.is_none() {
        settle(setup);
    }
    let output = setup.output.lock().unwrap_or_else(PoisonError::into_inner);
    let after = |prefix: &str| output.iter().rev().find_map(|line| line.strip_prefix(prefix)).map(|rest| rest.trim().to_string());
    let running = setup.ended.is_none();
    FeishuProgress {
        running,
        qr: running.then(|| fs::read(&setup.qr).ok()).flatten().map(|png| format!("data:image/png;base64,{}", STANDARD.encode(png))),
        url: after("URL:"),
        done: matches!(setup.ended, Some(Ok(()))),
        allow_from: after("allow_from:"),
        error: setup.ended.as_ref().and_then(|ended| ended.as_ref().err().cloned()),
    }
}

/// Why it did not finish: cc-connect's last error line, else its last line.
fn failure(output: &[String]) -> UserError {
    let line = output.iter().rev().find(|line| line.starts_with("Error")).or(output.last());
    UserError::new("ccConnect.feishuUnfinished", "The Feishu QR setup did not finish.").detail(line.map_or("", String::as_str))
}

/// Stops a setup still waiting for the scan and takes its project out again. One that made the app
/// in the second before nothing settled it yet keeps it: Feishu has the app, the config its keys.
pub(super) fn cancel() {
    let Some(mut setup) = setup().take() else { return };
    if setup.ended.is_none() {
        settle(&mut setup);
    }
    if setup.ended.is_none() {
        let _ = setup.child.kill();
        let _ = setup.child.wait();
        let _ = config_file::restore(&setup.config, setup.original.as_deref());
    }
    let _ = fs::remove_file(&setup.qr);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cancel_keeps_an_app_already_made_and_otherwise_puts_the_old_config_back() {
        let dir = std::env::temp_dir().join(format!("focusd-cc-connect-feishu-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let config = dir.join("config.toml");
        let begin = |program: &str, args: &[&str], said: &[&str]| {
            fs::write(&config, "with the app").unwrap();
            let child = Command::new(program).args(args).stdout(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn().unwrap();
            let output = Arc::new(Mutex::new(said.iter().map(|line| line.to_string()).collect()));
            let qr = dir.join("qr.png");
            *setup() = Some(Setup { child, _job: Job::new().unwrap(), output, qr, config: config.clone(), original: Some("before".into()), ended: None });
        };

        // cc-connect made the app and ended, and nothing has settled that yet.
        begin("cmd", &["/c", "exit 0"], &["✅ Feishu app created"]);
        setup().as_mut().unwrap().child.wait().unwrap();
        cancel();
        assert_eq!(fs::read_to_string(&config).unwrap(), "with the app");

        // Still waiting for the scan.
        begin("ping", &["-n", "30", "127.0.0.1"], &["URL: https://open.feishu.cn/x"]);
        cancel();
        assert_eq!(fs::read_to_string(&config).unwrap(), "before");
        assert!(setup().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_drawn_qr_code_and_blank_lines_are_left_out() {
        assert_eq!(worth_keeping("  URL: https://open.feishu.cn/x "), Some("URL: https://open.feishu.cn/x".into()));
        assert_eq!(worth_keeping("█▀▀▀▀▀█ ▄▄ █▀▀▀▀▀█"), None);
        assert_eq!(worth_keeping("   "), None);
    }

    #[test]
    fn a_failure_says_cc_connect_s_error() {
        let output = ["请扫码".to_string(), "Error: onboarding failed: timed out".into(), "Tip: bind instead".into()];
        assert_eq!(failure(&output).to_string(), "The Feishu QR setup did not finish: Error: onboarding failed: timed out");
        assert_eq!(failure(&output[..1]).to_string(), "The Feishu QR setup did not finish: 请扫码");
        assert_eq!(failure(&[]).to_string(), "The Feishu QR setup did not finish.");
    }
}
