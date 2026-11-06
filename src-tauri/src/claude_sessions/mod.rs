//! Claude Code sessions as reported by claude-sessions (github.com/Nicsilver/claude-sessions):
//! its hooks keep one state file per session, which this module reads for the island's
//! session ring. Liveness and staleness are judged here, so it works with claude-sessions'
//! own window closed.

mod scan;
mod transcript;

use std::{
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError},
        Mutex, OnceLock, PoisonError,
    },
    thread,
    time::Duration,
};

use tauri::{AppHandle, Emitter};

pub use scan::ClaudeSessionsSnapshot;

use crate::{system::windows_home_dir, win32};

// Mirrored by CLAUDE_SESSIONS_CHANGED_EVENT in src/features/claude-sessions/api.ts. The
// payload is a ClaudeSessionsSnapshot.
pub(crate) const CLAUDE_SESSIONS_CHANGED_EVENT: &str = "claude-sessions-changed";

// Hooks write on every tool call; this keeps the ring within a couple of seconds of them.
const POLL_INTERVAL: Duration = Duration::from_millis(1500);

static APP: OnceLock<AppHandle> = OnceLock::new();
/// The running watcher's stop handle: dropping it ends the watcher.
static WATCHER: Mutex<Option<Sender<()>>> = Mutex::new(None);

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

/// claude-sessions' state directory, only ever read: `~/.claude/session-status/state`.
fn state_dir() -> Result<PathBuf, String> {
    Ok(windows_home_dir()?
        .join(".claude")
        .join("session-status")
        .join("state"))
}

fn read(dir: &Path) -> ClaudeSessionsSnapshot {
    let host = std::env::var("COMPUTERNAME").unwrap_or_default();
    let process_start = |pid: u32| {
        win32::process_times::running_start_time(pid).map(|ticks| match ticks {
            0 => 0.0,
            ticks => scan::filetime_to_unix(ticks),
        })
    };
    scan::scan(
        dir,
        &scan::Probe {
            now: scan::unix_now(),
            host: &host,
            process_start: &process_start,
        },
    )
}

/// Starts watching (restarting a running watcher): emits `CLAUDE_SESSIONS_CHANGED_EVENT`
/// with the first snapshot, then whenever it changes.
#[expect(
    dead_code,
    reason = "called by the session ring's built-in plugin, wired up next"
)]
pub(crate) fn start() -> Result<(), String> {
    let app = APP
        .get()
        .cloned()
        .ok_or_else(|| "Claude sessions are not initialized.".to_string())?;
    let dir = state_dir()?;
    let (stop, stopped) = mpsc::channel();
    // Replacing the handle drops the previous one, which ends that watcher.
    *WATCHER.lock().unwrap_or_else(PoisonError::into_inner) = Some(stop);
    thread::Builder::new()
        .name("claude-sessions".into())
        .spawn(move || watch(&app, &dir, &stopped))
        .map(|_| ())
        .map_err(|error| format!("Failed to watch Claude sessions: {error}"))
}

#[expect(
    dead_code,
    reason = "called by the session ring's built-in plugin, wired up next"
)]
pub(crate) fn stop() {
    WATCHER
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
}

fn watch(app: &AppHandle, dir: &Path, stopped: &Receiver<()>) {
    let mut last = None;
    loop {
        let next = read(dir);
        // Stopped or replaced during the read: the event belongs to the newer watcher, if any.
        if stopped.try_recv() != Err(TryRecvError::Empty) {
            return;
        }
        if last.as_ref() != Some(&next) {
            let _ = app.emit(CLAUDE_SESSIONS_CHANGED_EVENT, &next);
            last = Some(next);
        }
        if stopped.recv_timeout(POLL_INTERVAL) != Err(RecvTimeoutError::Timeout) {
            return;
        }
    }
}

/// Current sessions, read now.
#[tauri::command]
pub async fn get_claude_sessions() -> Result<ClaudeSessionsSnapshot, String> {
    Ok(read(&state_dir()?))
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::claude_sessions::get_claude_sessions,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests;
