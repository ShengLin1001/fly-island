//! What a phone push needs from a Claude Code session's transcript (src/features/agent-status/push):
//! what it waits on (the question it asks with AskUserQuestion, the plan it put up with
//! ExitPlanMode, or else its last reply, in full rather than cut to a title), and how it was
//! started (`entrypoint`: "cli" for the terminal, "sdk-cli" for `claude -p`, as cc-connect runs it,
//! "sdk-ts" for an Agent SDK host such as Happy). Read from the tail on demand, so the session list
//! sent every few seconds does not carry it.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use super::reply_marker::split_reply;

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushDetail {
    pub entrypoint: Option<String>,
    pub wait: Option<WaitText>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitText {
    /// "question", "plan" or "reply".
    pub kind: &'static str,
    pub text: String,
}

/// `~/.claude/projects/<project>/<session_id>.jsonl` under `home_dir` (a mirrored home works too);
/// None for an id that is not a plain file name.
pub(super) fn claude_transcript(home_dir: &Path, session_id: &str) -> Option<PathBuf> {
    if session_id.is_empty() || !session_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return None;
    }
    let file_name = format!("{session_id}.jsonl");
    std::fs::read_dir(home_dir.join(".claude").join("projects"))
        .ok()?
        .flatten()
        .map(|project| project.path().join(&file_name))
        .find(|path| path.is_file())
}

pub(super) fn claude_push_detail(tail: &str) -> PushDetail {
    let records = || tail.lines().rev().filter_map(|line| serde_json::from_str::<Value>(line).ok());
    PushDetail {
        entrypoint: records().find_map(|record| record["entrypoint"].as_str().map(str::to_string)),
        wait: claude_wait_text(records()),
    }
}

/// The newest main-chain assistant record that says something: an open question or plan, or text.
/// None when it called some other tool (a permission prompt; the caller names the tool instead).
fn claude_wait_text(newest_first: impl Iterator<Item = Value>) -> Option<WaitText> {
    for record in newest_first {
        if record["type"] != "assistant" || record["isSidechain"] == Value::Bool(true) {
            continue;
        }
        let Some(blocks) = record["message"]["content"].as_array() else { continue };
        if let Some(tool) = blocks.iter().rev().find(|block| block["type"] == "tool_use") {
            let input = &tool["input"];
            return match tool["name"].as_str() {
                Some("AskUserQuestion") => Some(WaitText { kind: "question", text: question_text(input) }),
                Some("ExitPlanMode") => input["plan"].as_str().map(|plan| WaitText { kind: "plan", text: plan.trim().to_string() }),
                _ => None,
            };
        }
        let text = blocks
            .iter()
            .filter(|block| block["type"] == "text")
            .filter_map(|block| block["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        // A record of thinking alone says nothing; the reply is in an older one.
        let reply = split_reply(&text).1.trim();
        if !reply.is_empty() {
            return Some(WaitText { kind: "reply", text: reply.to_string() });
        }
    }
    None
}

/// The questions one after another, each with its options numbered from 1, as the terminal shows them.
fn question_text(input: &Value) -> String {
    let mut lines = Vec::new();
    for question in input["questions"].as_array().into_iter().flatten() {
        lines.push(format!("❓ {}", question["question"].as_str().unwrap_or_default()));
        for (number, option) in question["options"].as_array().into_iter().flatten().enumerate() {
            let label = option["label"].as_str().unwrap_or_default();
            lines.push(match option["description"].as_str().filter(|text| !text.is_empty()) {
                Some(description) => format!("  {}. {label} — {description}", number + 1),
                None => format!("  {}. {label}", number + 1),
            });
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::{claude_push_detail, PushDetail, WaitText};
    use serde_json::json;

    fn tail(records: &[serde_json::Value]) -> String {
        records.iter().map(ToString::to_string).collect::<Vec<_>>().join("\n")
    }

    fn assistant(content: serde_json::Value) -> serde_json::Value {
        json!({"type": "assistant", "message": {"content": content}})
    }

    fn claude_wait_text(tail: &str) -> Option<WaitText> {
        claude_push_detail(tail).wait
    }

    #[test]
    fn an_open_question_is_pushed_with_numbered_options() {
        let ask = assistant(json!([{"type": "tool_use", "name": "AskUserQuestion", "input": {"questions": [
            {"question": "Which one?", "options": [{"label": "A", "description": "first"}, {"label": "B"}]}
        ]}}]));
        let text = claude_wait_text(&tail(&[assistant(json!([{"type": "text", "text": "Before"}])), ask]));
        assert_eq!(text, Some(WaitText { kind: "question", text: "❓ Which one?\n  1. A — first\n  2. B".into() }));
    }

    #[test]
    fn a_plan_and_a_reply_are_pushed_whole() {
        let plan = assistant(json!([{"type": "tool_use", "name": "ExitPlanMode", "input": {"plan": "# Plan\n1. do it\n"}}]));
        assert_eq!(claude_wait_text(&tail(&[plan])), Some(WaitText { kind: "plan", text: "# Plan\n1. do it".into() }));
        let reply = assistant(json!([{"type": "text", "text": "Done. Shall I go on?\n\n↩"}]));
        let thinking = assistant(json!([{"type": "thinking", "thinking": "hm"}]));
        assert_eq!(claude_wait_text(&tail(&[reply, thinking])), Some(WaitText { kind: "reply", text: "Done. Shall I go on?".into() }));
    }

    #[test]
    fn the_newest_entrypoint_tells_how_the_session_runs() {
        let first = json!({"type": "user", "entrypoint": "cli"});
        let last = json!({"type": "assistant", "entrypoint": "sdk-cli", "message": {"content": [{"type": "text", "text": "hi"}]}});
        let detail = claude_push_detail(&tail(&[first, last]));
        assert_eq!(detail, PushDetail { entrypoint: Some("sdk-cli".into()), wait: Some(WaitText { kind: "reply", text: "hi".into() }) });
        assert_eq!(claude_push_detail("not json"), PushDetail::default());
    }

    #[test]
    fn another_tool_and_subagents_say_nothing() {
        let bash = assistant(json!([{"type": "text", "text": "Running"}, {"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]));
        assert_eq!(claude_wait_text(&tail(&[bash])), None);
        let side = json!({"type": "assistant", "isSidechain": true, "message": {"content": [{"type": "text", "text": "sub"}]}});
        let main = assistant(json!([{"type": "text", "text": "main"}]));
        assert_eq!(claude_wait_text(&tail(&[main, side])).map(|text| text.text), Some("main".into()));
    }
}
