//! Built-in plugins: optional parts of the island that are compiled in but are
//! listed, switched on, granted permissions and configured like any plugin
//! (runtime type "builtin"). They need no download and no "allow third-party
//! plugins", and cannot be uninstalled. Today: the local API, the collapsed
//! island's center pattern, Claude usage and the Claude session ring.
//!
//! A built-in plugin whose work happens in the island window (a collapsed-bar
//! ring, say) needs only an entry in BUILTINS with `native` false: it starts and
//! stops as a no-op, and the window follows it with `useBuiltinPlugin(id)`, which
//! re-reads the plugin on the `plugin-view-changed` reset sent when it starts,
//! stops or its settings change (grants.rs, commands.rs).

use serde_json::{Map, Value};

use super::manifest::{parse_builtin_manifest, LocalizedText, PluginManifest};
use super::settings::InfoItem;
use crate::{claude_sessions, claude_usage, local_api};

pub(super) const LOCAL_API_ID: &str = "focusd.local-api";
pub(super) const LOCAL_API_ALLOW_WRITE: &str = "allowWrite";

const LOCAL_API_MANIFEST: &str = r#"{
  "id": "focusd.local-api",
  "name": { "zh-CN": "本地接口", "en": "Local API" },
  "description": {
    "zh-CN": "让脚本和其他程序通过 HTTP 读写待办和每日笔记，并上报 AI Agent 状态。只接受本机请求，并且需要访问令牌。用法见 docs/local-api.md。",
    "en": "Lets scripts and other programs read and change todos and the daily note and report AI agent status over HTTP. Only accepts requests from this computer, with an access token. See docs/local-api.md."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "TixXin",
  "runtime": { "type": "builtin" },
  "permissions": ["todos:read", "todos:write", "notes:read", "notes:write", "agent-status:write"],
  "contributes": {
    "settings": [
      {
        "key": "allowWrite",
        "type": "boolean",
        "title": { "zh-CN": "允许修改待办、笔记和 Agent 状态", "en": "Allow changes to todos, notes and agent status" },
        "description": { "zh-CN": "关闭时只能读取。", "en": "When off, it can only read." },
        "default": false
      }
    ],
    "commands": [
      { "id": "reset-token", "title": { "zh-CN": "重新生成令牌", "en": "Regenerate token" } }
    ]
  }
}"#;

// Works only in the island window (src/features/center-pattern). `pet` holds a pet's folder
// name; the plugin page offers the pets found on disk as a list (PluginDetailPage).
const CENTER_PATTERN_MANIFEST: &str = r#"{
  "id": "focusd.center-pattern",
  "name": { "zh-CN": "中心图案", "en": "Center pattern" },
  "description": {
    "zh-CN": "收起的岛上没有文字时，在中间显示一个小动画：跟随光标的眼睛、小鸟、呼吸光点、小猫，或一只 Codex 宠物（随 AI Agent 的状态换动作；岛上显示 Agent 标题时，宠物站在标题前代替 Agent 图标）。",
    "en": "When the collapsed island shows no text, a small animation sits in its middle: eyes that follow the cursor, a bird, a breathing light, a cat, or a Codex pet that acts out what your AI agents are doing (while the island shows an agent's title, the pet stands before it in place of the agent icon)."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "pattern",
        "type": "select",
        "title": { "zh-CN": "图案", "en": "Pattern" },
        "default": "eyes",
        "options": [
          { "value": "eyes", "title": { "zh-CN": "眼睛", "en": "Eyes" } },
          { "value": "bird", "title": { "zh-CN": "小鸟", "en": "Bird" } },
          { "value": "orb", "title": { "zh-CN": "光点", "en": "Light" } },
          { "value": "cat", "title": { "zh-CN": "小猫", "en": "Cat" } },
          { "value": "pet", "title": { "zh-CN": "宠物", "en": "Pet" } }
        ]
      },
      {
        "key": "pet",
        "type": "string",
        "title": { "zh-CN": "宠物", "en": "Pet" },
        "description": {
          "zh-CN": "图案选「宠物」时显示哪一只。宠物包（pet.json + spritesheet）放在 ~/.codex/pets 或应用数据目录的 pets 文件夹里；找不到时显示眼睛。",
          "en": "Which pet the Pet pattern shows. Pet packs (pet.json + spritesheet) go in ~/.codex/pets or the pets folder of the app data directory; without one the eyes show."
        },
        "default": ""
      }
    ]
  }
}"#;

pub(super) const CLAUDE_USAGE_ID: &str = "focusd.claude-usage";

const CLAUDE_USAGE_MANIFEST: &str = r#"{
  "id": "focusd.claude-usage",
  "name": { "zh-CN": "Claude 用量环", "en": "Claude usage ring" },
  "description": {
    "zh-CN": "在收起条上用同心双环显示 Claude 订阅用量：外环 5 小时，内环 7 天。只读取本机 Claude Code 保存的登录凭据（不刷新、不改写），经代理请求 api.anthropic.com，至少每 5 分钟一次；请求失败时可改读 claude-hud 写出的用量文件。",
    "en": "Shows Claude subscription usage as two rings on the collapsed bar: 5 hours outside, 7 days inside. Only reads the login Claude Code saved on this computer (never renews or rewrites it) and asks api.anthropic.com through a proxy, at most every 5 minutes; when that fails it can read the usage file claude-hud writes."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "proxy",
        "type": "string",
        "title": { "zh-CN": "代理地址", "en": "Proxy" },
        "description": { "zh-CN": "http:// 或 https:// 代理。留空时用 HTTPS_PROXY 环境变量，再没有就用 http://127.0.0.1:7897。不会绕过代理直连。", "en": "An http:// or https:// proxy. Empty uses the HTTPS_PROXY environment variable, else http://127.0.0.1:7897. Never connects without the proxy." }
      },
      {
        "key": "hudPath",
        "type": "string",
        "title": { "zh-CN": "claude-hud 用量文件", "en": "claude-hud usage file" },
        "description": { "zh-CN": "claude-hud 的 display.externalUsageWritePath（.json 完整路径）。接口请求失败时读它；留空则不读。", "en": "claude-hud's display.externalUsageWritePath (full .json path), read when the request fails. Empty: not used." }
      },
      {
        "key": "intervalMinutes",
        "type": "number",
        "title": { "zh-CN": "刷新间隔（分钟）", "en": "Refresh every (minutes)" },
        "min": 5,
        "max": 120,
        "default": 5
      }
    ]
  }
}"#;

pub(super) const CLAUDE_SESSIONS_ID: &str = "focusd.claude-sessions";

const CLAUDE_SESSIONS_MANIFEST: &str = r#"{
  "id": "focusd.claude-sessions",
  "name": { "zh-CN": "Claude 会话环", "en": "Claude session ring" },
  "description": {
    "zh-CN": "在收起条上用一个分段小环显示 Claude Code 会话：等授权、等你回复、运行、刚完成各有颜色，中间是会话数，点击打开 Agent 页。依赖 claude-sessions（github.com/Nicsilver/claude-sessions）的 hooks，只读取它的状态目录 ~/.claude/session-status/state，不修改任何文件。",
    "en": "Shows Claude Code sessions as a small segmented ring on the collapsed bar: needs approval, your turn, running and just done each have a colour, the count sits in the middle, and a click opens the Agent page. Needs the hooks of claude-sessions (github.com/Nicsilver/claude-sessions); only reads its state folder ~/.claude/session-status/state and changes no files."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" }
}"#;

/// Every built-in plugin: its id, its manifest (whose "id" must match), and
/// whether it has work in this process (`native`, see `start` and `stop`).
pub(super) const BUILTINS: &[(&str, &str, bool)] = &[
    (LOCAL_API_ID, LOCAL_API_MANIFEST, true),
    ("focusd.center-pattern", CENTER_PATTERN_MANIFEST, false),
    (CLAUDE_USAGE_ID, CLAUDE_USAGE_MANIFEST, true),
    (CLAUDE_SESSIONS_ID, CLAUDE_SESSIONS_MANIFEST, true),
];

/// Every built-in plugin's id and manifest.
pub(super) fn manifests(app_version: &str) -> Vec<(&'static str, Result<PluginManifest, String>)> {
    BUILTINS.iter().map(|&(id, text, _)| (id, parse_builtin_manifest(text, id, app_version))).collect()
}

pub(super) fn is_builtin(id: &str) -> bool {
    BUILTINS.iter().any(|&(builtin, _, _)| builtin == id)
}

/// Whether built-in plugin `id` has work in this process; an error for an id
/// that is not in `builtins`.
pub(super) fn has_native_work(builtins: &[(&str, &str, bool)], id: &str) -> Result<bool, String> {
    builtins
        .iter()
        .find(|&&(builtin, _, _)| builtin == id)
        .map(|&(_, _, native)| native)
        .ok_or_else(|| format!("Unknown built-in plugin {id}."))
}

fn allow_write(settings: &Map<String, Value>) -> bool {
    settings.get(LOCAL_API_ALLOW_WRITE).and_then(Value::as_bool).unwrap_or(false)
}

/// The usage ring's settings; empty text means "not set".
pub(super) fn claude_usage_config(settings: &Map<String, Value>) -> claude_usage::UsageConfig {
    let text = |key: &str| {
        settings
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    };
    claude_usage::UsageConfig {
        proxy: text("proxy"),
        hud_path: text("hudPath").map(Into::into),
        interval_minutes: settings.get("intervalMinutes").and_then(Value::as_u64).unwrap_or(5),
    }
}

fn local_api_info(status: local_api::LocalApiStatus) -> Vec<InfoItem> {
    vec![
        InfoItem::new(LocalizedText::new("地址", "Address"), status.url, true, false),
        InfoItem::new(LocalizedText::new("访问令牌", "Access token"), status.token, true, true),
        InfoItem::new(LocalizedText::new("配置文件", "Config file"), status.config_path, true, false),
    ]
}

/// Starts a built-in plugin; returns the info for its page. Plugins that live in
/// the island window have nothing to start here.
pub(super) fn start(id: &str, settings: &Map<String, Value>) -> Result<Vec<InfoItem>, String> {
    if !has_native_work(BUILTINS, id)? {
        return Ok(Vec::new());
    }
    match id {
        LOCAL_API_ID => local_api::start(allow_write(settings)).map(local_api_info),
        CLAUDE_USAGE_ID => claude_usage::start(claude_usage_config(settings)).map(|()| Vec::new()),
        CLAUDE_SESSIONS_ID => claude_sessions::start().map(|dir| {
            vec![InfoItem::new(LocalizedText::new("状态目录（只读）", "State folder (read only)"), dir, true, false)]
        }),
        _ => Err(format!("Built-in plugin {id} is marked native but has no start.")),
    }
}

pub(super) fn stop(id: &str) -> Result<(), String> {
    if !has_native_work(BUILTINS, id)? {
        return Ok(());
    }
    match id {
        LOCAL_API_ID => local_api::stop(),
        CLAUDE_USAGE_ID => {
            claude_usage::stop();
            Ok(())
        }
        CLAUDE_SESSIONS_ID => {
            claude_sessions::stop();
            Ok(())
        }
        _ => Ok(()),
    }
}

pub(super) fn settings_changed(id: &str, settings: &Map<String, Value>) -> Result<(), String> {
    match id {
        LOCAL_API_ID => local_api::set_allow_write(allow_write(settings)),
        CLAUDE_USAGE_ID => claude_usage::start(claude_usage_config(settings)),
        _ => Ok(()),
    }
}

/// Runs one of the plugin's commands; returns its new info.
pub(super) fn run_command(id: &str, command: &str) -> Result<Vec<InfoItem>, String> {
    match (id, command) {
        (LOCAL_API_ID, "reset-token") => local_api::reset_token().map(local_api_info),
        _ => Err("Unknown plugin command.".into()),
    }
}
