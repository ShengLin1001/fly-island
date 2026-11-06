use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, UNIX_EPOCH},
};

use serde_json::json;

use super::scan::{
    scan, ClaudeSessionCounts, Probe, MAX_STATE_FILE_BYTES, RECENT_DONE_SECS, WORKING_STALE_SECS,
};

const NOW: f64 = 1_800_000_000.0;
const HOST: &str = "DESK";

struct TempDir(PathBuf);

impl TempDir {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "focusd-claude-sessions-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn write(&self, id: &str, state: &str, pid: u32, updated: f64, extra: serde_json::Value) {
        let mut entry = json!({
            "session_id": id, "state": state, "pid": pid, "updated_at": updated,
            "host": HOST, "cwd": "F:\\code\\fly-island", "topic": format!("topic {id}"),
        });
        if let (Some(entry), Some(extra)) = (entry.as_object_mut(), extra.as_object()) {
            entry.extend(extra.clone());
        }
        fs::write(self.0.join(format!("{id}.json")), entry.to_string()).unwrap();
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// pid 1-99 run since well before NOW, 100-199 started after NOW - 60 (a recycled id), others are gone.
fn process_start(pid: u32) -> Option<f64> {
    match pid {
        1..=99 => Some(NOW - 86_400.0),
        100..=199 => Some(NOW - 60.0),
        _ => None,
    }
}

fn scan_at(dir: &Path) -> super::ClaudeSessionsSnapshot {
    scan(
        dir,
        &Probe {
            now: NOW,
            host: HOST,
            process_start: &process_start,
        },
    )
}

#[test]
fn a_missing_directory_is_reported_as_not_detected() {
    let snapshot = scan_at(Path::new("Z:\\no\\such\\claude-sessions-dir"));
    assert!(!snapshot.detected);
    assert!(snapshot.sessions.is_empty());
    assert_eq!(snapshot.counts, ClaudeSessionCounts::default());
}

#[test]
fn sessions_sort_by_state_then_newest_and_are_counted() {
    let dir = TempDir::new("sort");
    dir.write(
        "done-old",
        "done",
        1,
        NOW - RECENT_DONE_SECS - 5.0,
        json!({}),
    );
    dir.write("done", "done", 2, NOW - 30.0, json!({}));
    dir.write("working", "working", 3, NOW - 5.0, json!({}));
    dir.write("yourturn", "yourturn", 4, NOW - 50.0, json!({}));
    dir.write("needs-old", "needs", 5, NOW - 40.0, json!({}));
    dir.write(
        "needs-new",
        "needs",
        6,
        NOW - 10.0,
        json!({ "tab_title": "Tab" }),
    );
    dir.write("idle", "idle", 7, NOW - 10.0, json!({}));
    dir.write("odd", "start", 8, NOW - 10.0, json!({}));
    fs::write(dir.0.join("partial.json"), "{\"session_id\":").unwrap();
    fs::write(dir.0.join("notes.txt"), "not a state file").unwrap();

    let snapshot = scan_at(&dir.0);
    assert!(snapshot.detected);
    let order: Vec<&str> = snapshot
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect();
    assert_eq!(
        order,
        [
            "needs-new",
            "needs-old",
            "yourturn",
            "working",
            "done",
            "done-old",
            "idle",
            "odd"
        ]
    );
    assert_eq!(snapshot.sessions[0].title, "Tab");
    assert_eq!(snapshot.sessions[1].title, "topic needs-old");
    assert_eq!(snapshot.sessions[7].state, "idle");
    assert_eq!(
        snapshot.sessions[0].updated_at,
        ((NOW - 10.0) * 1000.0) as u64
    );
    // The old done session is listed but no longer on the ring.
    assert_eq!(
        snapshot.counts,
        ClaudeSessionCounts {
            needs: 2,
            yourturn: 1,
            working: 1,
            stale: 0,
            done: 1,
            total: 5
        }
    );
}

#[test]
fn dead_and_recycled_processes_are_skipped_without_touching_files() {
    let dir = TempDir::new("alive");
    dir.write("alive", "working", 1, NOW - 5.0, json!({}));
    dir.write("dead", "working", 500, NOW - 5.0, json!({}));
    // pid 100 started 60 s ago, after this file's last hook: someone else has the id now.
    dir.write("recycled", "needs", 100, NOW - 120.0, json!({}));
    dir.write("no-pid", "yourturn", 0, NOW - 5.0, json!({}));
    dir.write(
        "other-host",
        "working",
        500,
        NOW - 5.0,
        json!({ "host": "HPC-LOGIN" }),
    );
    dir.write(
        "other-host-old",
        "working",
        500,
        NOW - 2.0 * 86_400.0,
        json!({ "host": "HPC-LOGIN" }),
    );

    // Valid, alive, but far bigger than any claude-sessions state file.
    let padding = "x".repeat(MAX_STATE_FILE_BYTES as usize);
    dir.write("huge", "needs", 1, NOW - 5.0, json!({ "padding": padding }));

    let snapshot = scan_at(&dir.0);
    let mut ids: Vec<&str> = snapshot
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect();
    ids.sort_unstable();
    assert_eq!(ids, ["alive", "no-pid", "other-host"]);
    assert_eq!(
        fs::read_dir(&dir.0).unwrap().count(),
        7,
        "state files are never deleted"
    );
}

#[test]
fn quiet_working_sessions_are_stale_unless_the_transcript_moves() {
    let dir = TempDir::new("stale");
    let quiet = NOW - WORKING_STALE_SECS - 10.0;
    let transcript = dir.0.join("busy.jsonl");
    fs::write(&transcript, "{}\n").unwrap();
    let recent = UNIX_EPOCH + Duration::from_secs_f64(NOW - 20.0);
    fs::File::options()
        .write(true)
        .open(&transcript)
        .unwrap()
        .set_modified(recent)
        .unwrap();
    dir.write(
        "quiet",
        "working",
        1,
        quiet,
        json!({ "transcript": dir.0.join("missing.jsonl") }),
    );
    dir.write(
        "busy",
        "working",
        2,
        quiet,
        json!({ "transcript": transcript }),
    );
    dir.write("waiting", "yourturn", 3, quiet, json!({}));

    let snapshot = scan_at(&dir.0);
    let stale: Vec<(&str, bool)> = snapshot
        .sessions
        .iter()
        .map(|session| (session.session_id.as_str(), session.stale))
        .collect();
    assert_eq!(
        stale,
        [("waiting", false), ("busy", false), ("quiet", true)]
    );
    assert_eq!(
        snapshot.counts,
        ClaudeSessionCounts {
            needs: 0,
            yourturn: 1,
            working: 1,
            stale: 1,
            done: 0,
            total: 3
        }
    );
}

fn assistant(blocks: serde_json::Value) -> serde_json::Value {
    json!({ "type": "assistant", "message": { "role": "assistant", "content": blocks } })
}

fn user(content: serde_json::Value) -> serde_json::Value {
    json!({ "type": "user", "message": { "role": "user", "content": content } })
}

fn tool_use(id: &str) -> serde_json::Value {
    assistant(json!([{ "type": "tool_use", "id": id, "name": "Bash", "input": {} }]))
}

fn tool_result(id: &str) -> serde_json::Value {
    user(json!([{ "type": "tool_result", "tool_use_id": id, "content": "ok" }]))
}

fn text(text: &str) -> serde_json::Value {
    assistant(json!([{ "type": "text", "text": text }]))
}

/// Whether a transcript made of `entries` (plus Claude Code's metadata lines) reads as busy.
fn busy(dir: &TempDir, name: &str, entries: &[serde_json::Value]) -> bool {
    let path = dir.0.join(format!("{name}.jsonl"));
    let mut lines: Vec<String> = vec![user(json!("run the tests")).to_string()];
    for entry in entries {
        lines.push(entry.to_string());
        lines.push(json!({ "type": "last-prompt", "lastPrompt": "x" }).to_string());
    }
    lines.push(json!({ "type": "system", "subtype": "stop_hook_summary" }).to_string());
    fs::write(&path, lines.join("\n") + "\n").unwrap();
    super::transcript::still_busy(&path.display().to_string())
}

#[test]
fn the_transcript_tells_a_running_tool_or_a_background_wait_from_a_stall() {
    let dir = TempDir::new("transcript");
    assert!(busy(&dir, "tool", &[text("Building."), tool_use("a")]));
    // Two tools in parallel; only the first has returned.
    assert!(busy(
        &dir,
        "parallel",
        &[tool_use("a"), tool_use("b"), tool_result("a")]
    ));
    assert!(busy(
        &dir,
        "background",
        &[
            tool_use("a"),
            tool_result("a"),
            text("Waiting on the build.\n\n◐\n")
        ]
    ));
    assert!(!busy(
        &dir,
        "finished",
        &[tool_use("a"), tool_result("a"), text("All done.\n\n●")]
    ));
    // ◐ only counts on the reply's last line, and only while nothing came after it.
    assert!(!busy(&dir, "mid", &[text("◐ means waiting.\nDone.")]));
    assert!(!busy(
        &dir,
        "superseded",
        &[text("◐"), tool_use("a"), tool_result("a"), text("Done.")]
    ));
    // The tool returned and the model's next reply has not arrived (a slow or retried call).
    assert!(busy(
        &dir,
        "awaiting-reply",
        &[tool_use("a"), tool_result("a")]
    ));
    // A new prompt ends the old turn, so its unanswered tool no longer counts.
    assert!(!busy(
        &dir,
        "new-turn",
        &[tool_use("a"), user(json!("never mind"))]
    ));
    assert!(!super::transcript::still_busy(""));
    assert!(!super::transcript::still_busy(
        &dir.0.join("missing.jsonl").display().to_string()
    ));
}

/// `entries`, each followed by a ~100 KB metadata line as Claude Code writes after replies.
fn with_request_shapes(entries: &[serde_json::Value]) -> String {
    let shape = json!({ "type": "api-request-shape", "shape": "x".repeat(100_000) }).to_string();
    let mut body = String::new();
    for entry in entries {
        body.push_str(&entry.to_string());
        body.push('\n');
        body.push_str(&shape);
        body.push('\n');
    }
    body
}

#[test]
fn a_long_transcript_is_judged_by_its_end() {
    let dir = TempDir::new("long-transcript");
    let filler: Vec<serde_json::Value> = (0..12).map(|_| text("Earlier reply.")).collect();
    let mut entries = filler.clone();
    entries.push(tool_use("late"));
    let tool = dir.0.join("tool.jsonl");
    fs::write(&tool, with_request_shapes(&entries)).unwrap();
    assert!(super::transcript::still_busy(&tool.display().to_string()));

    let mut entries = filler;
    entries.push(text("Started the job.\n\n◐"));
    let waiting = dir.0.join("waiting.jsonl");
    fs::write(&waiting, with_request_shapes(&entries)).unwrap();
    assert!(super::transcript::still_busy(
        &waiting.display().to_string()
    ));

    // The verdict is cached per length and modification time; a change is read again.
    fs::write(&waiting, with_request_shapes(&[text("All done.\n\n●")])).unwrap();
    assert!(!super::transcript::still_busy(
        &waiting.display().to_string()
    ));
}

#[test]
fn a_quiet_session_waiting_on_background_work_is_not_stale() {
    let dir = TempDir::new("waiting");
    let quiet = NOW - WORKING_STALE_SECS - 10.0;
    let transcript = dir.0.join("waiting.jsonl");
    fs::write(&transcript, text("Started the job.\n\n◐").to_string()).unwrap();
    let old = UNIX_EPOCH + Duration::from_secs_f64(quiet);
    fs::File::options()
        .write(true)
        .open(&transcript)
        .unwrap()
        .set_modified(old)
        .unwrap();
    dir.write(
        "waiting",
        "working",
        1,
        quiet,
        json!({ "transcript": transcript }),
    );

    let snapshot = scan_at(&dir.0);
    assert!(!snapshot.sessions[0].stale);
    assert_eq!(snapshot.counts.working, 1);
}

#[test]
fn filetime_converts_to_unix_seconds() {
    assert_eq!(super::scan::filetime_to_unix(116_444_736_000_000_000), 0.0);
}

/// Prints what this machine's claude-sessions directory holds: `cargo test -- --ignored --nocapture real_state_dir`.
#[test]
#[ignore = "reads the real ~/.claude/session-status/state"]
fn real_state_dir() {
    let snapshot = super::read(&super::state_dir().unwrap());
    println!("{}", serde_json::to_string_pretty(&snapshot).unwrap());
}
