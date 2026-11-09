//! SSH proxy tunnel (built-in plugin `focusd.ssh-proxy-tunnel`, off by default): for each host of
//! the SSH list switched on in the plugin page, a resident `ssh -R` lends the server this
//! computer's proxy (Clash Verge, v2rayN or any port), so `http_proxy=http://127.0.0.1:<port>`
//! there goes out through it. Separate from the session fetch's connection, which carries the
//! approval forward (agent_status/remote_fetch.rs). Which hosts and their ports there live in
//! `ssh-tunnels.json` (config.rs); each tunnel runs on a thread of its own (tunnel.rs), and a
//! watcher keeps looking where the local proxy is (local_proxy.rs), moving the tunnels with it.

mod config;
mod local_proxy;
#[cfg(test)]
mod tests;
mod tunnel;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::Duration,
};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

use crate::agent_status::{remote_fetch::run_ssh, remote_hosts};
use local_proxy::{Choice, LocalProxy};
use tunnel::{Spec, Status};

/// How often the watcher looks again where the local proxy is.
const WATCH_EVERY: Duration = Duration::from_secs(15);

static APP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// A running tunnel; dropping it (its stop sender) ends its thread and ssh.
struct Tunnel {
    spec: Spec,
    status: Arc<Mutex<Status>>,
    _stop: mpsc::Sender<()>,
}

#[derive(Default)]
struct State {
    /// The local proxy the settings pick; Some while the plugin runs.
    choice: Option<Choice>,
    /// Where the watcher last found it; the tunnels forward to its port.
    proxy: Option<LocalProxy>,
    /// Wakes the watcher; dropping it ends the watcher.
    watcher: Option<mpsc::Sender<()>>,
    tunnels: HashMap<String, Tunnel>,
}

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default).lock().unwrap_or_else(PoisonError::into_inner)
}

/// Remembers the app data folder; runs before the plugin host starts built-in plugins.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let _ = APP_DIR.set(dir);
    Ok(())
}

fn app_dir() -> Result<PathBuf, String> {
    APP_DIR.get().cloned().ok_or_else(|| "The SSH proxy tunnel is not set up yet".to_string())
}

/// Starts the watcher, which finds the local proxy and then starts the tunnels of the hosts
/// switched on; after a settings change, wakes it to look again at once.
pub(crate) fn start(settings: &Map<String, Value>) -> Result<(), String> {
    let choice = local_proxy::choice(settings)?;
    let mut state = state();
    state.choice = Some(choice);
    if let Some(watcher) = &state.watcher {
        let _ = watcher.send(());
        return Ok(());
    }
    let (watcher, woken) = mpsc::channel();
    thread::Builder::new()
        .name("ssh-tunnel-proxy".into())
        .spawn(move || watch_proxy(&woken))
        .map_err(|error| format!("Could not start looking for the local proxy: {error}"))?;
    state.watcher = Some(watcher);
    Ok(())
}

/// Ends the watcher and every tunnel.
pub(crate) fn stop() {
    let mut state = state();
    state.choice = None;
    state.proxy = None;
    state.watcher = None;
    state.tunnels.clear();
}

/// Looks where the local proxy is (at once, when woken and every WATCH_EVERY) and moves the
/// tunnels when its port changed, until the plugin stops.
fn watch_proxy(woken: &mpsc::Receiver<()>) {
    loop {
        let (choice, current) = {
            let state = state();
            (state.choice, state.proxy)
        };
        let Some(choice) = choice else { return };
        // Unlocked: a port nothing listens on takes a moment to refuse.
        let found = local_proxy::find(choice, current);
        {
            let mut state = state();
            // A settings change meanwhile has woken this loop to look again.
            if state.choice == Some(choice) {
                let moved = state.proxy.map(|proxy| proxy.port) != Some(found.port);
                state.proxy = Some(found);
                if moved {
                    // Fails only without the app folder or a thread, which set_ssh_tunnel reports.
                    let _ = apply(&mut state);
                }
            }
        }
        if matches!(woken.recv_timeout(WATCH_EVERY), Err(mpsc::RecvTimeoutError::Disconnected)) {
            return;
        }
    }
}

/// Makes the running tunnels match the saved hosts: ends those switched off or changed, starts
/// the missing ones.
fn apply(state: &mut State) -> Result<(), String> {
    let app_dir = app_dir()?;
    let wanted: Vec<Spec> = match state.proxy {
        Some(LocalProxy { port: local_port, .. }) => config::read(&app_dir)
            .into_iter()
            .filter(|saved| saved.enabled)
            .map(|saved| Spec {
                target: remote_hosts::target(&app_dir, &saved.host),
                host: saved.host,
                remote_port: saved.remote_port,
                local_port,
            })
            .collect(),
        None => Vec::new(),
    };
    state.tunnels.retain(|_, tunnel| wanted.contains(&tunnel.spec));
    for spec in wanted {
        if state.tunnels.contains_key(&spec.host) {
            continue;
        }
        let (stop, stopped) = mpsc::channel();
        let status = Arc::new(Mutex::new(Status::Connecting));
        let (dir, thread_spec, thread_status) = (app_dir.clone(), spec.clone(), Arc::clone(&status));
        thread::Builder::new()
            .name(format!("ssh-tunnel-{}", spec.host))
            .spawn(move || tunnel::supervise(&dir, &thread_spec, &thread_status, &stopped))
            .map_err(|error| format!("Could not start the tunnel to {}: {error}", spec.host))?;
        state.tunnels.insert(spec.host.clone(), Tunnel { spec, status, _stop: stop });
    }
    Ok(())
}

/// One host of the SSH list and its tunnel. Mirrored by `SshTunnelHost` in src/features/ssh-tunnel/api.ts.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelHost {
    host: String,
    enabled: bool,
    remote_port: Option<u16>,
    /// off, connecting, connected, portInUse or error.
    state: &'static str,
    error: Option<String>,
}

/// The hosts of ~/.ssh/config, then those added in the island (Settings → AI Agent), then saved
/// ones found in neither, so they can still be switched off.
fn listing() -> Result<Vec<TunnelHost>, String> {
    let app_dir = app_dir()?;
    let saved = config::read(&app_dir);
    let ssh_config = crate::system::windows_home_dir()
        .ok()
        .and_then(|home| std::fs::read_to_string(home.join(".ssh").join("config")).ok())
        .unwrap_or_default();
    let found = remote_hosts::ssh_config_hosts(&ssh_config)
        .into_iter()
        .chain(remote_hosts::custom(&app_dir).into_iter().map(|custom| custom.name))
        .chain(saved.iter().map(|tunnel| tunnel.host.clone()));
    let mut names: Vec<String> = Vec::new();
    for name in found {
        if !names.contains(&name) {
            names.push(name);
        }
    }
    let state = state();
    Ok(names
        .into_iter()
        .map(|host| {
            let saved = saved.iter().find(|tunnel| tunnel.host == host);
            let status = state.tunnels.get(&host).map(|tunnel| tunnel.status.lock().unwrap_or_else(PoisonError::into_inner).clone());
            let (state, error) = match status {
                None => ("off", None),
                Some(Status::Connecting) => ("connecting", None),
                Some(Status::Connected) => ("connected", None),
                Some(Status::PortInUse) => ("portInUse", None),
                Some(Status::Failed(error)) => ("error", Some(error)),
            };
            TunnelHost { enabled: saved.is_some_and(|tunnel| tunnel.enabled), remote_port: saved.map(|tunnel| tunnel.remote_port), host, state, error }
        })
        .collect())
}

/// The SSH list with each host's tunnel switch, port there and how it is doing.
#[tauri::command]
pub async fn get_ssh_tunnels() -> Result<Vec<TunnelHost>, String> {
    listing()
}

/// Saves a host's tunnel switch and port there (no port: forgotten, and off) and applies it.
#[tauri::command]
pub async fn set_ssh_tunnel(host: String, enabled: bool, remote_port: Option<u16>) -> Result<Vec<TunnelHost>, String> {
    config::set(&app_dir()?, &host, enabled, remote_port)?;
    apply(&mut state())?;
    listing()
}

/// The local proxy the tunnels forward to and whether something listens there; None while the
/// plugin is off or has not looked yet.
#[tauri::command]
pub async fn get_ssh_tunnel_proxy() -> Result<Option<LocalProxy>, String> {
    Ok(state().proxy)
}

/// Whether something already listens on `remote_port` on `host` (another tunnel, say), asked
/// with one short ssh before a tunnel is set up there.
#[tauri::command]
pub async fn check_ssh_tunnel_port(host: String, remote_port: u16) -> Result<bool, String> {
    if !remote_hosts::is_valid_alias(&host) {
        return Err(format!("\"{host}\" is not an SSH host name"));
    }
    if remote_port < config::MIN_REMOTE_PORT {
        return Err(format!("The port on the server must be {}–65535", config::MIN_REMOTE_PORT));
    }
    let target = remote_hosts::target(&app_dir()?, &host);
    tauri::async_runtime::spawn_blocking(move || {
        let output = run_ssh(&target, tunnel::PORT_CHECK_SCRIPT)?;
        tunnel::port_listening(&String::from_utf8_lossy(&output), remote_port)
    })
    .await
    .map_err(|error| format!("The port check failed: {error}"))?
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::ssh_tunnel::get_ssh_tunnels,
            crate::ssh_tunnel::get_ssh_tunnel_proxy,
            crate::ssh_tunnel::set_ssh_tunnel,
            crate::ssh_tunnel::check_ssh_tunnel_port,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
