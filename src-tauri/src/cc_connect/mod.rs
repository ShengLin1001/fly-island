//! cc-connect (github.com/chenhg5/cc-connect) as a phone push channel: it already runs bots on
//! Telegram, Discord, Feishu and more for the user's coding agents, so a push to the phone is a
//! message from that bot, and the reply can take the session over. This finds the program, lists
//! the chats each project has talked to, and sends one message with `cc-connect send`, which hands
//! it to the running cc-connect. What to push and when is decided in the island
//! (src/features/agent-status/push); the built-in plugin `focusd.cc-connect` holds the settings.

mod chats;
mod locate;

use std::{
    io::{Read, Write},
    os::windows::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;

use crate::system::{windows_home_dir, CREATE_NO_WINDOW};

const SEND_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_TEXT_CHARS: usize = 16_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcConnectStatus {
    /// The program; None when it is nowhere to be found.
    exe: Option<String>,
    /// How it was found: "setting", "running" or "path".
    exe_source: Option<&'static str>,
    /// Why the path set on the plugin page cannot be used.
    exe_error: Option<String>,
    /// Some cc-connect is running; `send` only works then.
    running: bool,
    /// Its data folder, `~/.cc-connect`.
    data_dir: String,
    projects: Vec<chats::Project>,
}

fn data_dir() -> Result<std::path::PathBuf, String> {
    // shortcut: a `data_dir` set in cc-connect's config is not followed; read it once someone sets one.
    windows_home_dir().map(|home| home.join(".cc-connect"))
}

/// The program, whether it runs, and the chats of each project. `path`: the plugin's setting.
#[tauri::command]
pub async fn get_cc_connect_status(path: Option<String>) -> Result<CcConnectStatus, String> {
    let data_dir = data_dir()?;
    tauri::async_runtime::spawn_blocking(move || {
        let (found, exe_error) = match locate::find(path.as_deref()) {
            Ok(found) => (found, None),
            Err(error) => (None, Some(error)),
        };
        CcConnectStatus {
            exe: found.as_ref().map(|(exe, _)| exe.display().to_string()),
            exe_source: found.map(|(_, source)| source),
            exe_error,
            running: crate::win32::process::running_executable(&[locate::EXE_NAME]).is_some(),
            projects: chats::read_projects(&data_dir),
            data_dir: data_dir.display().to_string(),
        }
    })
    .await
    .map_err(|error| format!("Failed to join the cc-connect task: {error}"))
}

/// Sends `text` to one chat (`session_key`, as listed by `get_cc_connect_status`) of `project`.
#[tauri::command]
pub async fn send_cc_connect_message(path: Option<String>, project: String, session_key: String, text: String) -> Result<(), String> {
    let plain = |value: &str| !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control);
    if !plain(&project) || !plain(&session_key) || !session_key.contains(':') {
        return Err("cc-connect 项目或聊天无效。".into());
    }
    if text.trim().is_empty() {
        return Err("推送内容是空的。".into());
    }
    let text: String = text.chars().take(MAX_TEXT_CHARS).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let (exe, _) = locate::find(path.as_deref())?.ok_or_else(|| "找不到 cc-connect 程序，请在插件里填写它的路径。".to_string())?;
        send(&exe, &project, &session_key, &text)
    })
    .await
    .map_err(|error| format!("Failed to join the cc-connect task: {error}"))?
}

fn send(exe: &Path, project: &str, session_key: &str, text: &str) -> Result<(), String> {
    let mut child = Command::new(exe)
        .args(["send", "-p", project, "-s", session_key, "--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("无法运行 cc-connect：{error}"))?;
    // Dropping stdin after the write closes it, which ends the message.
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).map_err(|error| format!("无法把内容交给 cc-connect：{error}"))?;
    }
    let deadline = Instant::now() + SEND_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("cc-connect 10 秒没有回应。".into());
            }
            Err(error) => return Err(format!("cc-connect 出错：{error}")),
        }
    };
    if status.success() {
        return Ok(());
    }
    let mut stderr = String::new();
    if let Some(mut pipe) = child.stderr.take() {
        let _ = pipe.read_to_string(&mut stderr);
    }
    // "Error: cc-connect is not running (socket not found: ...)" and the like; the first line says it.
    let reason = stderr.lines().map(str::trim).find(|line| !line.is_empty()).map(str::to_string);
    Err(format!("cc-connect：{}", reason.unwrap_or_else(|| format!("退出码 {}", status.code().unwrap_or(-1)))))
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::cc_connect::get_cc_connect_status,
            crate::cc_connect::send_cc_connect_message,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
