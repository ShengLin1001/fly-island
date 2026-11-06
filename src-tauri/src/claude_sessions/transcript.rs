//! A second look at a "working" session whose hooks have gone quiet: the end of its Claude
//! Code transcript (`.jsonl`, one entry per line) tells a stalled session from a busy one.

use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use serde_json::Value;

/// How much of the transcript's end is read. Each reply is followed by a metadata line of
/// about 100 KiB (`api-request-shape`), so a smaller window loses the entries just before it.
const TAIL_BYTES: u64 = 1024 * 1024;
/// Transcripts remembered at most; real use has a handful of quiet sessions at a time.
const CACHE_LIMIT: usize = 64;

/// A transcript's length and modification time when it was judged, and the verdict.
type Verdict = (u64, SystemTime, bool);

/// Verdict per transcript path, kept while its length and modification time stay the same,
/// so a quiet session is not re-read on every poll.
static CACHE: Mutex<Option<HashMap<String, Verdict>>> = Mutex::new(None);

/// Whether the transcript shows the session still busy although no hook has fired lately:
/// a tool call without its result yet (Claude Code writes nothing while a long build or test
/// runs), a result waiting for the model's next reply (a slow or retried API call), or a turn
/// that ended on ◐, the user's "waiting on background work" marker, which claude-sessions
/// records as working and which no later hook refreshes.
pub(super) fn still_busy(path: &str) -> bool {
    let Some((len, modified)) = fs::metadata(path)
        .ok()
        .and_then(|meta| Some((meta.len(), meta.modified().ok()?)))
    else {
        return false;
    };
    let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    let cache = cache.get_or_insert_with(HashMap::new);
    if let Some(&(seen_len, seen_modified, busy)) = cache.get(path) {
        if (seen_len, seen_modified) == (len, modified) {
            return busy;
        }
    }
    let busy = busy_from(&read_tail(path));
    if cache.len() >= CACHE_LIMIT {
        cache.clear();
    }
    cache.insert(path.to_string(), (len, modified, busy));
    busy
}

fn busy_from(entries: &[Value]) -> bool {
    let mut pending = HashSet::new();
    let mut last_text: Option<&str> = None;
    let mut ends_on_result = false;
    for entry in entries {
        let role = entry["type"].as_str().unwrap_or_default();
        // Metadata lines (titles, modes, api requests) and injected meta prompts say nothing
        // about the turn.
        if !matches!(role, "user" | "assistant") || entry["isMeta"].as_bool() == Some(true) {
            continue;
        }
        let content = &entry["message"]["content"];
        let blocks = content.as_array().map(Vec::as_slice).unwrap_or_default();
        let only_results = !content.is_string()
            && !blocks.is_empty()
            && blocks.iter().all(|block| block["type"] == "tool_result");
        if role == "user" && !only_results {
            // A new prompt starts a new turn.
            pending.clear();
        }
        ends_on_result = role == "user" && only_results;
        last_text = None;
        for block in blocks {
            match (role, block["type"].as_str()) {
                ("assistant", Some("tool_use")) => {
                    pending.insert(block["id"].as_str().unwrap_or_default());
                }
                ("assistant", Some("text")) => last_text = block["text"].as_str(),
                ("user", Some("tool_result")) => {
                    pending.remove(block["tool_use_id"].as_str().unwrap_or_default());
                }
                _ => {}
            }
        }
    }
    let ends_waiting = last_text
        .and_then(|text| text.lines().rev().find(|line| !line.trim().is_empty()))
        .is_some_and(|line| line.contains('◐'));
    !pending.is_empty() || ends_on_result || ends_waiting
}

/// The parseable entries in the last `TAIL_BYTES` of `path`; none when it cannot be read.
fn read_tail(path: &str) -> Vec<Value> {
    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    let start = file
        .metadata()
        .map_or(0, |meta| meta.len().saturating_sub(TAIL_BYTES));
    let mut bytes = Vec::new();
    if file.seek(SeekFrom::Start(start)).is_err() || file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    let mut lines = bytes.split(|byte| *byte == b'\n');
    if start > 0 {
        lines.next(); // cut mid-line by the seek
    }
    lines
        .filter_map(|line| serde_json::from_slice(line).ok())
        .collect()
}
