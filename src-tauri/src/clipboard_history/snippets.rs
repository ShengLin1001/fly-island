//! Snippets (C24.6): texts the user keeps for pasting again, with a few variables filled in when
//! pasted: {date}, {time}, {datetime}, {weekday} and {clipboard} (what is on the clipboard now).

use chrono::{DateTime, Datelike, Local};
use serde::{Deserialize, Serialize};

use super::{
    current_unix_millis, store::create_item_id, ClipboardHistoryService, ClipboardHistorySnapshot,
};

const MAX_SNIPPETS: usize = 100;
const MAX_TITLE_CHARACTERS: usize = 40;
const MAX_TEXT_CHARACTERS: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnippet {
    id: String,
    title: String,
    text: String,
}

/// The snippet's text with its variables filled in; `{{` and `}}` stay literal braces.
pub(super) fn expand_snippet(text: &str, now: DateTime<Local>, clipboard: Option<&str>) -> String {
    const WEEKDAYS: [&str; 7] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    text.replace("{{", "\u{0}")
        .replace("}}", "\u{1}")
        .replace("{datetime}", &now.format("%Y-%m-%d %H:%M").to_string())
        .replace("{date}", &now.format("%Y-%m-%d").to_string())
        .replace("{time}", &now.format("%H:%M").to_string())
        .replace("{weekday}", WEEKDAYS[now.weekday().num_days_from_monday() as usize])
        .replace("{clipboard}", clipboard.unwrap_or_default())
        .replace('\u{0}', "{")
        .replace('\u{1}', "}")
}

impl ClipboardHistoryService {
    /// Adds a snippet (no `id`) or changes one; the title falls back to the text's first line.
    pub(super) fn save_snippet(&self, id: Option<&str>, title: &str, text: &str) -> Result<ClipboardHistorySnapshot, String> {
        let text: String = text.chars().take(MAX_TEXT_CHARACTERS).collect();
        if text.trim().is_empty() {
            return Err("A snippet needs some text.".to_string());
        }
        let title = match title.trim() {
            "" => text.lines().find(|line| !line.trim().is_empty()).unwrap_or_default().trim(),
            title => title,
        };
        let title: String = title.chars().take(MAX_TITLE_CHARACTERS).collect();
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        match id.and_then(|id| state.snippets.iter_mut().find(|snippet| snippet.id == id)) {
            Some(snippet) => {
                snippet.title = title;
                snippet.text = text;
            }
            None => {
                if state.snippets.len() >= MAX_SNIPPETS {
                    return Err(format!("At most {MAX_SNIPPETS} snippets."));
                }
                let now = current_unix_millis();
                let id = create_item_id(now, &format!("snippet{}", state.snippets.len()));
                state.snippets.push(ClipboardSnippet { id, title, text });
            }
        }
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);
        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn delete_snippet(&self, id: &str) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        state.snippets.retain(|snippet| snippet.id != id);
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);
        self.emit_changed();
        Ok(snapshot)
    }

    /// The snippet's text ready to paste, its variables filled in.
    pub(super) fn snippet_text(&self, id: &str) -> Result<String, String> {
        let text = {
            let state = self.state.lock().map_err(|error| error.to_string())?;
            state
                .snippets
                .iter()
                .find(|snippet| snippet.id == id)
                .map(|snippet| snippet.text.clone())
                .ok_or_else(|| "The snippet was not found.".to_string())?
        };
        let clipboard = if text.contains("{clipboard}") { arboard::Clipboard::new().ok().and_then(|mut board| board.get_text().ok()) } else { None };
        Ok(expand_snippet(&text, Local::now(), clipboard.as_deref()))
    }
}

#[cfg(test)]
mod tests {
    use super::expand_snippet;
    use chrono::{Local, TimeZone};

    #[test]
    fn variables_are_filled_in() {
        let now = Local.with_ymd_and_hms(2026, 11, 9, 14, 5, 0).single().expect("valid time");
        assert_eq!(
            expand_snippet("{date} {time} {weekday} [{clipboard}] {{date}}", now, Some("x")),
            "2026-11-09 14:05 周一 [x] {date}"
        );
        assert_eq!(expand_snippet("{datetime}", now, None), "2026-11-09 14:05");
        assert_eq!(expand_snippet("no vars", now, None), "no vars");
    }
}
