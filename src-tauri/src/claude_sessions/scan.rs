//! Reads the per-session state files claude-sessions' hooks write to
//! `~/.claude/session-status/state/<session_id>.json`. Read only: the files belong to
//! claude-sessions, so dead or recycled ones are skipped here, never deleted.

use std::{
    fs::{self, File},
    io::Read,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use serde_json::Value;

use super::transcript;

/// A "working" session whose state file and transcript have both been quiet this long is
/// marked stale, unless its transcript shows it still busy (`transcript::still_busy`).
/// Claude Code fires a hook around every tool call, so otherwise a gap this long means the
/// turn ended without a Stop hook; claude-sessions waits the same 180 s.
pub(super) const WORKING_STALE_SECS: f64 = 180.0;
/// Finished sessions count toward the ring for this long.
pub(super) const RECENT_DONE_SECS: f64 = 600.0;
/// How long a session recorded by another machine is trusted: its process cannot be looked
/// up from here, so only the file's age tells a running session from a forgotten one.
const OTHER_HOST_TRUST_SECS: f64 = 24.0 * 3600.0;
// shortcut: state files are about 1 KiB, so a larger one is not claude-sessions' and is
// skipped; raise the cap if its format grows.
pub(super) const MAX_STATE_FILE_BYTES: u64 = 64 * 1024;

/// Mirrored by ClaudeSession in src/features/claude-sessions/api.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSession {
    pub session_id: String,
    /// `needs`, `yourturn`, `working`, `done` or `idle` (any other value reads as `idle`).
    pub state: String,
    /// `working`, but nothing has moved for `WORKING_STALE_SECS`.
    pub stale: bool,
    /// The terminal tab title, else claude-sessions' topic; may be empty.
    pub title: String,
    pub cwd: String,
    /// Unix ms of the last hook.
    pub updated_at: u64,
}

/// What the ring shows. `working` leaves out stale sessions (counted in `stale`), `done`
/// only counts sessions finished in the last `RECENT_DONE_SECS`, and `total` is their sum.
/// Mirrored by ClaudeSessionCounts in src/features/claude-sessions/api.ts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct ClaudeSessionCounts {
    pub needs: u32,
    pub yourturn: u32,
    pub working: u32,
    pub stale: u32,
    pub done: u32,
    pub total: u32,
}

/// Mirrored by ClaudeSessionsSnapshot in src/features/claude-sessions/api.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionsSnapshot {
    /// The state directory exists, i.e. claude-sessions' hooks are installed.
    pub detected: bool,
    pub state_dir: String,
    /// Every session whose process still runs, needs > yourturn > working > stale > done >
    /// idle, newest first. Idle sessions and ones done before `RECENT_DONE_SECS` are listed
    /// but not counted. Sessions without a terminal (`claude --bg`, IDE agents) are included
    /// on purpose: they still work and still wait for you.
    pub sessions: Vec<ClaudeSession>,
    pub counts: ClaudeSessionCounts,
}

/// What a scan needs from the machine, injected so tests run without live processes.
pub(super) struct Probe<'a> {
    /// Unix seconds.
    pub now: f64,
    /// This machine's name, compared with each file's `host`.
    pub host: &'a str,
    /// Start time (Unix seconds, 0 when unreadable) of a process that is still running;
    /// `None` when it has exited.
    pub process_start: &'a dyn Fn(u32) -> Option<f64>,
}

pub(super) fn scan(dir: &Path, probe: &Probe) -> ClaudeSessionsSnapshot {
    let state_dir = dir.display().to_string();
    let Ok(entries) = fs::read_dir(dir) else {
        return ClaudeSessionsSnapshot {
            detected: false,
            state_dir,
            sessions: Vec::new(),
            counts: ClaudeSessionCounts::default(),
        };
    };
    let mut sessions: Vec<ClaudeSession> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        // A file being rewritten by a hook fails to read or parse; the next poll picks it up.
        .filter_map(|path| read_capped(&path))
        .filter_map(|text| serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')).ok())
        .filter_map(|root| read_session(&root, probe))
        .collect();
    sessions.sort_by(|a, b| rank(a).cmp(&rank(b)).then(b.updated_at.cmp(&a.updated_at)));
    let counts = count(&sessions, probe.now);
    ClaudeSessionsSnapshot {
        detected: true,
        state_dir,
        sessions,
        counts,
    }
}

/// Text of a state file; `None` when unreadable or over `MAX_STATE_FILE_BYTES`.
fn read_capped(path: &Path) -> Option<String> {
    let mut text = String::new();
    File::open(path)
        .ok()?
        .take(MAX_STATE_FILE_BYTES + 1)
        .read_to_string(&mut text)
        .ok()?;
    (text.len() as u64 <= MAX_STATE_FILE_BYTES).then_some(text)
}

fn read_session(root: &Value, probe: &Probe) -> Option<ClaudeSession> {
    let text = |key: &str| root[key].as_str().unwrap_or_default().to_string();
    let updated = root["updated_at"].as_f64().unwrap_or(0.0);
    if !process_may_be_alive(root, updated, probe) {
        return None;
    }
    let state = match root["state"].as_str() {
        Some(state @ ("needs" | "yourturn" | "working" | "done")) => state.to_string(),
        _ => "idle".to_string(),
    };
    let stale = state == "working" && {
        let transcript = text("transcript");
        let last_activity = updated.max(modified_secs(&transcript));
        probe.now - last_activity > WORKING_STALE_SECS && !transcript::still_busy(&transcript)
    };
    let title = Some(text("tab_title"))
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| text("topic"));
    Some(ClaudeSession {
        session_id: text("session_id"),
        state,
        stale,
        title,
        cwd: text("cwd"),
        updated_at: (updated.max(0.0) * 1000.0) as u64,
    })
}

/// Whether the Claude Code process the file names may still be running. On this machine:
/// the process exists and did not start after the file's last update (a later start means
/// Windows handed the id to a new process); a file without a pid cannot be checked and is
/// kept. From another machine (`host` differs): trusted for `OTHER_HOST_TRUST_SECS`.
fn process_may_be_alive(root: &Value, updated: f64, probe: &Probe) -> bool {
    let host = root["host"].as_str().unwrap_or_default();
    let recorded_here =
        host.is_empty() || probe.host.is_empty() || host.eq_ignore_ascii_case(probe.host);
    let pid = root["pid"]
        .as_u64()
        .and_then(|pid| u32::try_from(pid).ok())
        .unwrap_or(0);
    match (recorded_here, pid) {
        (false, _) => updated <= 0.0 || probe.now - updated <= OTHER_HOST_TRUST_SECS,
        (true, 0) => true,
        (true, pid) => (probe.process_start)(pid)
            .is_some_and(|start| start <= 0.0 || updated <= 0.0 || start <= updated),
    }
}

/// Last-modified time of `path` in Unix seconds, 0 when it is missing.
fn modified_secs(path: &str) -> f64 {
    if path.is_empty() {
        return 0.0;
    }
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0.0, |age| age.as_secs_f64())
}

fn rank(session: &ClaudeSession) -> u8 {
    match (session.state.as_str(), session.stale) {
        ("needs", _) => 0,
        ("yourturn", _) => 1,
        ("working", false) => 2,
        ("working", true) => 3,
        ("done", _) => 4,
        _ => 5,
    }
}

fn count(sessions: &[ClaudeSession], now: f64) -> ClaudeSessionCounts {
    let mut counts = ClaudeSessionCounts::default();
    for session in sessions {
        match (session.state.as_str(), session.stale) {
            ("needs", _) => counts.needs += 1,
            ("yourturn", _) => counts.yourturn += 1,
            ("working", false) => counts.working += 1,
            ("working", true) => counts.stale += 1,
            ("done", _) if now - session.updated_at as f64 / 1000.0 <= RECENT_DONE_SECS => {
                counts.done += 1
            }
            _ => continue,
        }
        counts.total += 1;
    }
    counts
}

/// Unix seconds now.
pub(super) fn unix_now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |now| now.as_secs_f64())
}

/// Windows FILETIME ticks (100 ns since 1601) to Unix seconds.
pub(super) fn filetime_to_unix(ticks: u64) -> f64 {
    ticks as f64 / 10_000_000.0 - 11_644_473_600.0
}
