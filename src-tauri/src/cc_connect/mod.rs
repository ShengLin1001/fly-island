//! cc-connect (github.com/chenhg5/cc-connect) as a phone push channel: it already runs bots on
//! Telegram, Discord, Feishu and more for the user's coding agents, so a push to the phone is a
//! message from that bot, and the reply can take the session over. This finds the program, lists
//! the chats each project has talked to, and sends one message with `cc-connect send`, which hands
//! it to the running cc-connect. What to push and when is decided in the island
//! (src/features/agent-status/push); the built-in plugin `focusd.cc-connect` holds the settings.
//!
//! For a start from nothing the plugin page also downloads the program (install.rs), checks a
//! bot token (bots.rs), adds a project to cc-connect's config (config_file.rs; Feishu's through
//! cc-connect's own QR setup, feishu.rs), and keeps cc-connect running (runner.rs).

mod bots;
mod chats;
mod config_file;
mod feishu;
mod install;
mod locate;
mod runner;

use std::{
    io::{Read, Write},
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::system::{windows_home_dir, CREATE_NO_WINDOW};

static APP_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Remembers the app data folder, where a downloaded cc-connect lives; runs before plugins start.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let _ = APP_DIR.set(dir);
    Ok(())
}

fn app_dir() -> Option<&'static Path> {
    APP_DIR.get().map(PathBuf::as_path)
}

const SEND_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_TEXT_CHARS: usize = 16_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcConnectStatus {
    /// The program; None when it is nowhere to be found.
    exe: Option<String>,
    /// How it was found: "setting", "running", "path", "downloaded" or "installed".
    exe_source: Option<&'static str>,
    /// Why the path set on the plugin page cannot be used.
    exe_error: Option<String>,
    /// Some cc-connect is running; `send` only works then.
    running: bool,
    /// The island's own cc-connect (the "run" setting): "off", "starting", "running", "external",
    /// "noConfig" or "failed" with `runner_error`.
    runner: &'static str,
    runner_error: Option<String>,
    /// Its data folder, `~/.cc-connect`.
    data_dir: String,
    /// Whether `config.toml` is there.
    config: bool,
    /// The projects in it, chats or not.
    config_projects: Vec<String>,
    /// The user's folder: the setup's default work folder.
    home: String,
    projects: Vec<chats::Project>,
}

fn data_dir() -> Result<PathBuf, String> {
    // shortcut: a `data_dir` set in cc-connect's config is not followed; read it once someone sets one.
    windows_home_dir().map(|home| home.join(".cc-connect"))
}

/// Starts or stops the island's cc-connect to match the plugin's settings (plugin_host/builtin.rs).
pub(crate) fn apply(settings: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    runner::apply(settings, app_dir(), config_file::config_path(&data_dir()?))
}

pub(crate) fn stop() {
    runner::stop();
    feishu::cancel();
}

/// The program, whether it runs, and the chats of each project. `path`: the plugin's setting.
#[tauri::command]
pub async fn get_cc_connect_status(path: Option<String>) -> Result<CcConnectStatus, String> {
    let data_dir = data_dir()?;
    tauri::async_runtime::spawn_blocking(move || {
        let (found, exe_error) = match locate::find(path.as_deref(), app_dir()) {
            Ok(found) => (found, None),
            Err(error) => (None, Some(error)),
        };
        let run = runner::state();
        let config = std::fs::read_to_string(config_file::config_path(&data_dir)).ok();
        CcConnectStatus {
            exe: found.as_ref().map(|(exe, _)| exe.display().to_string()),
            exe_source: found.map(|(_, source)| source),
            exe_error,
            running: crate::win32::process::running_executable(&[locate::EXE_NAME]).is_some(),
            runner: run.key(),
            runner_error: run.error(),
            projects: chats::read_projects(&data_dir),
            config_projects: config.as_deref().map(config_file::project_names).unwrap_or_default(),
            config: config.is_some(),
            home: data_dir.parent().map(|home| home.display().to_string()).unwrap_or_default(),
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
        let (exe, _) = locate::find(path.as_deref(), app_dir())?.ok_or_else(|| "找不到 cc-connect 程序，请在插件里填写它的路径。".to_string())?;
        send(&exe, &project, &session_key, &text)
    })
    .await
    .map_err(|error| format!("Failed to join the cc-connect task: {error}"))?
}

/// Downloads the latest cc-connect for this computer into the island's data folder; returns where.
#[tauri::command]
pub async fn install_cc_connect() -> Result<String, String> {
    let app_dir = app_dir().ok_or("cc-connect 还没准备好。")?.to_path_buf();
    install::install(app_dir).await.map(|exe| exe.display().to_string())
}

/// The bot behind a Telegram or Discord token, and on Telegram who has written to it.
#[tauri::command]
pub async fn check_cc_connect_bot(platform: String, token: String) -> Result<bots::BotCheck, String> {
    bots::check(&platform, &token).await
}

/// Adds a project for one bot to cc-connect's config and restarts the island's cc-connect. For
/// Feishu it starts the QR setup instead (`get_cc_connect_feishu_setup` follows it).
#[tauri::command]
pub async fn add_cc_connect_project(
    path: Option<String>,
    project: String,
    work_dir: String,
    platform: String,
    token: String,
    allow_from: String,
) -> Result<(), String> {
    let config = config_file::config_path(&data_dir()?);
    let app_dir = app_dir().ok_or("cc-connect 还没准备好。")?.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let proxy = crate::system::updater::get_updater_proxy();
        let new = config_file::NewProject {
            name: project.trim(),
            work_dir: work_dir.trim(),
            platform: &platform,
            token: token.trim(),
            allow_from: allow_from.trim(),
            proxy: proxy.as_deref(),
        };
        let now = chrono::Local::now();
        let (today, stamp) = (now.format("%Y-%m-%d").to_string(), now.format("%Y%m%d-%H%M%S").to_string());
        if platform == "feishu" {
            let (exe, _) = locate::find(path.as_deref(), Some(&app_dir))?.ok_or("找不到 cc-connect 程序，请先下载。")?;
            return feishu::start(&exe, &config, &new, &app_dir, &today, &stamp);
        }
        config_file::add_project(&config, &new, &today, &stamp)?;
        runner::restart();
        Ok(())
    })
    .await
    .map_err(|error| format!("Failed to join the cc-connect task: {error}"))?
}

// Off the main thread: both may wait on cc-connect a moment.
#[tauri::command]
pub async fn get_cc_connect_feishu_setup() -> Result<feishu::FeishuProgress, String> {
    tauri::async_runtime::spawn_blocking(feishu::progress)
        .await
        .map_err(|error| format!("Failed to join the cc-connect task: {error}"))
}

#[tauri::command]
pub async fn cancel_cc_connect_feishu_setup() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(feishu::cancel)
        .await
        .map_err(|error| format!("Failed to join the cc-connect task: {error}"))
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
            crate::cc_connect::install_cc_connect,
            crate::cc_connect::check_cc_connect_bot,
            crate::cc_connect::add_cc_connect_project,
            crate::cc_connect::get_cc_connect_feishu_setup,
            crate::cc_connect::cancel_cc_connect_feishu_setup,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
