//! The chats each cc-connect project has talked to, from its session files
//! (`<data dir>/sessions/<project>_<hash>.json`): a chat shows up once its user has sent the bot a
//! message. Its key (`telegram:<chat>:<user>`) is what `cc-connect send -s` takes.

use std::{collections::BTreeMap, fs, path::Path};

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub chats: Vec<Chat>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    /// `<platform>:<chat id>:<user id>`.
    pub key: String,
    /// "telegram", "discord", "feishu" and so on: the key's first part.
    pub platform: String,
    /// The user's name as cc-connect saw it; None when it kept none.
    pub user_name: Option<String>,
}

/// The project a session file belongs to, undoing cc-connect's `sessionStorePath`: `<name>.json`,
/// the older `<name>.sessions.json`, and `<name>_<8 hex>.json` or `<name>_ws_<8 hex>.json` (a hash
/// of the work folder).
pub(super) fn project_name(file_name: &str) -> Option<&str> {
    let base = file_name.strip_suffix(".json")?;
    let base = base.strip_suffix(".sessions").unwrap_or(base);
    let name = match base.rsplit_once('_') {
        Some((head, hash)) if hash.len() == 8 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()) => {
            head.strip_suffix("_ws").unwrap_or(head)
        }
        _ => base,
    };
    (!name.is_empty()).then_some(name)
}

/// The chats in one session file, by key.
pub(super) fn chats_of(text: &str) -> Vec<Chat> {
    let Ok(store) = serde_json::from_str::<Value>(text) else { return Vec::new() };
    let Some(sessions) = store["user_sessions"].as_object() else { return Vec::new() };
    sessions
        .keys()
        .filter_map(|key| {
            let (platform, _) = key.split_once(':')?;
            let user_name = store["user_meta"][key]["user_name"].as_str().filter(|name| !name.is_empty());
            Some(Chat { key: key.clone(), platform: platform.to_string(), user_name: user_name.map(str::to_string) })
        })
        .collect()
}

/// Every project with a session file under `data_dir`, by name, with its chats; a project whose
/// work folder changed has a file for each, and their chats are put together.
pub(super) fn read_projects(data_dir: &Path) -> Vec<Project> {
    let mut projects: BTreeMap<String, BTreeMap<String, Chat>> = BTreeMap::new();
    for entry in fs::read_dir(data_dir.join("sessions")).into_iter().flatten().flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str().and_then(project_name) else { continue };
        let chats = projects.entry(name.to_string()).or_default();
        for chat in chats_of(&fs::read_to_string(entry.path()).unwrap_or_default()) {
            chats.entry(chat.key.clone()).or_insert(chat);
        }
    }
    projects
        .into_iter()
        .map(|(name, chats)| Project { name, chats: chats.into_values().collect() })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{chats_of, project_name, Chat};

    #[test]
    fn a_session_file_names_its_project() {
        assert_eq!(project_name("pc_60329304.json"), Some("pc"));
        assert_eq!(project_name("my_bot_ws_0a1b2c3d.json"), Some("my_bot"));
        assert_eq!(project_name("mybot.sessions.json"), Some("mybot"));
        assert_eq!(project_name("bot_cafe.json"), Some("bot_cafe"));
        assert_eq!(project_name("notes.txt"), None);
        assert_eq!(project_name("_60329304.json"), None);
    }

    #[test]
    fn chats_come_with_their_platform_and_user_name() {
        let text = r#"{"user_sessions": {"telegram:1:1": ["s1"], "discord:2:3": ["s2"], "broken": []},
            "user_meta": {"telegram:1:1": {"user_name": "pj"}}}"#;
        let mut chats = chats_of(text);
        chats.sort_by(|a, b| a.key.cmp(&b.key));
        assert_eq!(
            chats,
            vec![
                Chat { key: "discord:2:3".into(), platform: "discord".into(), user_name: None },
                Chat { key: "telegram:1:1".into(), platform: "telegram".into(), user_name: Some("pj".into()) },
            ]
        );
        assert!(chats_of("not json").is_empty());
    }
}
