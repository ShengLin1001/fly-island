//! Adds a project to cc-connect's `config.toml` for the setup on the plugin page: one
//! `[[projects]]` block appended as text, so what the user wrote, comments too, stays as it was
//! (a TOML library would rewrite the file). The old file is copied to
//! `config.toml.bak-focusd-<time>` first; a file is made when there is none. The agent is Claude
//! Code in `default` mode, so every tool call still asks on the phone.

use crate::user_error::UserError;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(super) const FILE_NAME: &str = "config.toml";
pub(super) const PLATFORMS: [&str; 3] = ["telegram", "discord", "feishu"];

/// What the setup asks for. Feishu has no token or `allow_from` here: its QR setup in cc-connect
/// fills the app's credentials and the owner (feishu.rs).
pub(super) struct NewProject<'a> {
    pub(super) name: &'a str,
    pub(super) work_dir: &'a str,
    pub(super) platform: &'a str,
    pub(super) token: &'a str,
    pub(super) allow_from: &'a str,
    /// For the bot's own requests: Telegram and Discord are out of reach without one in some places.
    pub(super) proxy: Option<&'a str>,
}

pub(super) fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

fn id_like(value: &str) -> bool {
    (1..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// Why `project` cannot be added to a config whose projects are `taken`, if it cannot.
pub(super) fn check(project: &NewProject, taken: &[String]) -> Result<(), UserError> {
    if !id_like(project.name) {
        return Err(UserError::new("ccConnect.projectName", "A project name takes letters, digits, - and _, up to 64 characters."));
    }
    if taken.iter().any(|name| name == project.name) {
        return Err(UserError::new("ccConnect.projectTaken", format!("cc-connect already has a project called {}; pick another name.", project.name)).arg("name", project.name));
    }
    let dir = Path::new(project.work_dir);
    if !dir.is_absolute() || !dir.is_dir() {
        return Err(UserError::new("ccConnect.workDir", format!("The work folder does not exist: {}", project.work_dir)).arg("path", project.work_dir));
    }
    if !PLATFORMS.contains(&project.platform) {
        return Err(UserError::new("ccConnect.platform", format!("Unsupported platform: {}", project.platform)).arg("platform", project.platform));
    }
    if project.platform == "feishu" {
        return Ok(());
    }
    if project.token.is_empty() || project.token.len() > 512 || project.token.chars().any(|ch| ch.is_whitespace() || ch.is_control()) {
        return Err(UserError::new("ccConnect.token", "That bot token does not look right."));
    }
    // Empty or "*" lets anyone who finds the bot work on this computer.
    let ids: Vec<&str> = project.allow_from.split(',').map(str::trim).collect();
    if ids.iter().any(|id| !id_like(id)) {
        return Err(UserError::new("ccConnect.allowFrom", "Fill in your own user ID (several separated by commas), or anyone who finds the bot can use this computer."));
    }
    Ok(())
}

/// A TOML basic string.
pub(super) fn toml_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if ch.is_control() => out.push_str(&format!("\\u{:04X}", ch as u32)),
            ch => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// The `[[projects]]` block for `project`, dated `today`.
pub(super) fn project_block(project: &NewProject, today: &str) -> String {
    let mut block = format!(
        "\n# Added by FocuSD Island on {today}.\n[[projects]]\nname = {}\n\n[projects.agent]\ntype = \"claudecode\"\n\n\
         [projects.agent.options]\nwork_dir = {}\nmode = \"default\"\n\n[[projects.platforms]]\ntype = {}\n\n[projects.platforms.options]\n",
        toml_string(project.name),
        toml_string(project.work_dir),
        toml_string(project.platform),
    );
    if project.platform != "feishu" {
        block.push_str(&format!("token = {}\nallow_from = {}\n", toml_string(project.token), toml_string(project.allow_from)));
        if let Some(proxy) = project.proxy {
            block.push_str(&format!("proxy = {}\n", toml_string(proxy)));
        }
    }
    block
}

/// The names of the `[[projects]]` in `text`: the first `name = "…"` under each.
pub(super) fn project_names(text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut in_project = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_project = line == "[[projects]]";
            continue;
        }
        if !in_project {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        if key.trim() == "name" {
            let value = value.split('#').next().unwrap_or("").trim().trim_matches(|ch| ch == '"' || ch == '\'');
            names.push(value.to_string());
            in_project = false;
        }
    }
    names
}

/// Appends `project` to the config at `path`; returns the text it had (None: there was no file),
/// to put back if the setup does not finish.
pub(super) fn add_project(path: &Path, project: &NewProject, today: &str, stamp: &str) -> Result<Option<String>, UserError> {
    let original = match fs::read_to_string(path) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(UserError::new("file.read", format!("Could not read {}.", path.display())).arg("path", path.display().to_string()).detail(error)),
    };
    check(project, &original.as_deref().map(project_names).unwrap_or_default())?;
    let mut text = match &original {
        Some(text) => {
            let backup = path.with_file_name(format!("{FILE_NAME}.bak-focusd-{stamp}"));
            fs::write(&backup, text).map_err(|error| UserError::new("file.backup", format!("Could not back up {}.", path.display())).arg("path", path.display().to_string()).detail(error))?;
            text.trim_end().to_string()
        }
        None => "# cc-connect configuration, started by FocuSD Island. `cc-connect config example` prints every option.".to_string(),
    };
    text.push('\n');
    text.push_str(&project_block(project, today));
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| UserError::new("file.create", format!("Could not create {}.", dir.display())).arg("path", dir.display().to_string()).detail(error))?;
    }
    write(path, &text)?;
    Ok(original)
}

/// Puts back what `add_project` found: the old text, or no file.
pub(super) fn restore(path: &Path, original: Option<&str>) -> Result<(), UserError> {
    match original {
        Some(text) => write(path, text),
        None => fs::remove_file(path).map_err(|error| UserError::new("file.undo", format!("Could not undo {}.", path.display())).arg("path", path.display().to_string()).detail(error)),
    }
}

/// Through a `.tmp` file, so cc-connect never reads half a config.
fn write(path: &Path, text: &str) -> Result<(), UserError> {
    let temp = path.with_file_name(format!("{FILE_NAME}.focusd.tmp"));
    fs::write(&temp, text).map_err(|error| UserError::new("file.write", format!("Could not write {}.", temp.display())).arg("path", temp.display().to_string()).detail(error))?;
    fs::rename(&temp, path).map_err(|error| UserError::new("file.write", format!("Could not write {}.", path.display())).arg("path", path.display().to_string()).detail(error))
}

#[cfg(test)]
mod tests {
    use super::{add_project, check, project_block, project_names, restore, toml_string, NewProject};
    use std::fs;

    fn telegram<'a>(name: &'a str, work_dir: &'a str, allow_from: &'a str) -> NewProject<'a> {
        NewProject { name, work_dir, platform: "telegram", token: "123:abc", allow_from, proxy: Some("http://127.0.0.1:7897") }
    }

    #[test]
    fn strings_are_escaped_for_toml() {
        assert_eq!(toml_string(r"C:\Users\a"), r#""C:\\Users\\a""#);
        assert_eq!(toml_string("a\"b\nc\u{1}"), r#""a\"b\nc\u0001""#);
    }

    #[test]
    fn a_project_needs_a_free_plain_name_a_folder_and_who_may_use_it() {
        let home = std::env::temp_dir();
        let home = home.to_str().unwrap();
        assert!(check(&telegram("phone", home, "123456"), &[]).is_ok());
        assert!(check(&telegram("phone", home, "123,456"), &[]).is_ok());
        assert_eq!(check(&telegram("phone", home, "123"), &["phone".into()]).unwrap_err().code(), "ccConnect.projectTaken");
        assert!(check(&telegram("my phone", home, "123"), &[]).is_err());
        assert!(check(&telegram("phone", r"Z:\nowhere\at\all", "123"), &[]).is_err());
        for open in ["", "*", "123,*", "1 2"] {
            assert!(check(&telegram("phone", home, open), &[]).is_err(), "{open:?}");
        }
        let feishu = NewProject { platform: "feishu", token: "", allow_from: "", ..telegram("phone", home, "") };
        assert!(check(&feishu, &[]).is_ok());
    }

    #[test]
    fn the_block_is_a_claude_code_project_with_one_platform() {
        let block = project_block(&telegram("phone", r"C:\work", "123"), "2026-11-09");
        assert!(block.contains("[[projects]]\nname = \"phone\""));
        assert!(block.contains("type = \"claudecode\""));
        assert!(block.contains(r#"work_dir = "C:\\work""#));
        assert!(block.contains("type = \"telegram\""));
        assert!(block.contains("token = \"123:abc\"\nallow_from = \"123\"\nproxy = \"http://127.0.0.1:7897\""));
        let feishu = NewProject { platform: "feishu", token: "", allow_from: "", proxy: None, ..telegram("phone", r"C:\work", "") };
        assert!(project_block(&feishu, "2026-11-09").ends_with("[projects.platforms.options]\n"));
    }

    #[test]
    fn project_names_are_the_first_name_under_each_project() {
        let text = "[log]\nname = \"no\"\n[[projects]]\nname = \"a\" # mine\n[projects.agent]\nname = \"x\"\n[[projects]]\n  name='b'\n";
        assert_eq!(project_names(text), ["a", "b"]);
    }

    #[test]
    fn adding_keeps_the_old_text_backs_it_up_and_can_be_undone() {
        let dir = std::env::temp_dir().join(format!("focusd-cc-connect-config-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("config.toml");
        let work = std::env::temp_dir();
        let work = work.to_str().unwrap();

        let none = add_project(&path, &telegram("a", work, "1"), "2026-11-09", "1").unwrap();
        assert_eq!(none, None);
        let first = fs::read_to_string(&path).unwrap();
        assert_eq!(project_names(&first), ["a"]);

        let had = add_project(&path, &telegram("b", work, "1"), "2026-11-09", "2").unwrap();
        assert_eq!(had.as_deref(), Some(first.as_str()));
        assert_eq!(fs::read_to_string(dir.join("config.toml.bak-focusd-2")).unwrap(), first);
        let both = fs::read_to_string(&path).unwrap();
        assert!(both.starts_with(first.trim_end()));
        assert_eq!(project_names(&both), ["a", "b"]);
        assert!(add_project(&path, &telegram("b", work, "1"), "2026-11-09", "3").is_err());

        restore(&path, had.as_deref()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), first);
        restore(&path, None).unwrap();
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
