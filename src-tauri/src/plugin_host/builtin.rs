//! Built-in plugins: optional parts of the island that are compiled in but are
//! listed, switched on, granted permissions and configured like any plugin
//! (runtime type "builtin"). They need no download and no "allow third-party
//! plugins", and cannot be uninstalled. Today: the local API and the collapsed
//! island's center pattern, agent usage rings and agent session ring, the SSH
//! proxy tunnel and the cc-connect phone link.
//!
//! A built-in plugin whose work happens in the island window (a collapsed-bar
//! ring, say) needs only an entry in BUILTINS with `native` false: it starts and
//! stops as a no-op, and the window follows it with `useBuiltinPlugin(id)`, which
//! re-reads the plugin on the `plugin-view-changed` reset sent when it starts,
//! stops or its settings change (grants.rs, commands.rs).

use serde_json::{Map, Value};

use super::manifest::{parse_builtin_manifest, LocalizedText, PluginManifest};
use super::settings::InfoItem;
use crate::{cc_connect, claude_usage, local_api, ssh_tunnel};

pub(super) const LOCAL_API_ID: &str = "focusd.local-api";
pub(super) const LOCAL_API_ALLOW_WRITE: &str = "allowWrite";

const LOCAL_API_MANIFEST: &str = r#"{
  "id": "focusd.local-api",
  "name": { "zh-CN": "本地接口", "en": "Local API" },
  "description": {
    "zh-CN": "让脚本和其他程序通过 HTTP 读写待办和每日笔记，并上报 AI Agent 状态。只接受本机请求，并且需要访问令牌。用法见 docs/features/local-api.md。",
    "en": "Lets scripts and other programs read and change todos and the daily note and report AI agent status over HTTP. Only accepts requests from this computer, with an access token. See docs/features/local-api.md."
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
    "zh-CN": "收起的岛上没有文字时，在中间显示一个小动画：跟随光标的眼睛、小鸟、呼吸光点、小猫、随 AI Agent 状态变色的悬岛标志，或一只 Codex 宠物（随 AI Agent 的状态换动作；岛上显示 Agent 标题时，宠物或悬岛标志站在标题前代替 Agent 图标）。",
    "en": "When the collapsed island shows no text, a small animation sits in its middle: eyes that follow the cursor, a bird, a breathing light, a cat, the island mark, its light in your AI agents' state colour, or a Codex pet that acts out what your AI agents are doing (while the island shows an agent's title, the pet or the mark stands before it in place of the agent icon)."
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
          { "value": "mark", "title": { "zh-CN": "悬岛", "en": "Island mark" } },
          { "value": "pet", "title": { "zh-CN": "宠物", "en": "Pet" } }
        ]
      },
      {
        "key": "pet",
        "type": "string",
        "title": { "zh-CN": "宠物", "en": "Pet" },
        "description": {
          "zh-CN": "图案选「宠物」时显示哪一只，默认小八（xiaoba）。宠物包（pet.json + spritesheet）放在 ~/.codex/pets 或应用数据目录的 pets 文件夹里；找不到时显示眼睛。",
          "en": "Which pet the Pet pattern shows; xiaoba by default. Pet packs (pet.json + spritesheet) go in ~/.codex/pets or the pets folder of the app data directory; without one the eyes show."
        },
        "default": "xiaoba"
      },
      {
        "key": "size",
        "type": "number",
        "title": { "zh-CN": "大小（像素）", "en": "Size (px)" },
        "description": {
          "zh-CN": "图案的高度，默认 24，和收起条上的环一样高；悬岛量的是胶囊，宠物比它高 4。",
          "en": "How tall the pattern is; 24 by default, as tall as the rings on the collapsed bar. For the island mark it is the pill; a pet is 4 taller."
        },
        "min": 16,
        "max": 30,
        "default": 24
      }
    ]
  }
}"#;

pub(super) const CLAUDE_USAGE_ID: &str = "focusd.claude-usage";
pub(super) const CLAUDE_USAGE_ASK_ANTHROPIC: &str = "askAnthropic";

const CLAUDE_USAGE_MANIFEST: &str = r#"{
  "id": "focusd.claude-usage",
  "name": { "zh-CN": "Agent 用量环", "en": "Agent usage rings" },
  "description": {
    "zh-CN": "在收起条上给每个打开的 Agent 一个同心双环显示订阅用量：外环 5 小时，内环 7 天（没有周限额的套餐显示本月），悬停显示详情。每家一种颜色：Claude Code 橙、Codex 白、GLM 蓝紫、Kimi 蓝，用到 70% 和 90% 时统一变黄、变红，可以同时打开多个。Claude Code 默认读 claude-hud 写出的用量快照（和 Agent 页顶部相同），不联网、不读取登录凭据；没装 claude-hud 时，可以打开下面的「直接向 Anthropic 查询」。Codex 读本机 Codex 的会话记录。GLM 和 Kimi 用你在本页保存的 API Key 向各自的官方接口查询。",
    "en": "Gives each agent switched on below two rings of subscription usage on the collapsed bar: 5 hours outside, 7 days inside (the month for plans without a weekly limit), with details on hover. Each has its own colour (Claude Code orange, Codex white, GLM blue-violet, Kimi blue) until 70% and 90% turn any of them yellow and red; several can be on at once. Claude Code reads the usage snapshot claude-hud writes by default (as the Agent page does), with no network access and no login credentials; without claude-hud, switch on \"Ask Anthropic directly\" below. Codex reads Codex's session logs on this computer. GLM and Kimi ask their official endpoints with the API key saved on this page."
  },
  "version": "1.1.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "claudeCode",
        "type": "boolean",
        "title": { "zh-CN": "Claude Code", "en": "Claude Code" },
        "default": true
      },
      {
        "key": "codex",
        "type": "boolean",
        "title": { "zh-CN": "Codex", "en": "Codex" },
        "description": {
          "zh-CN": "读本机 Codex 会话记录里的额度（`CODEX_HOME` 或 ~/.codex 下的 sessions，和 Agent 页顶部相同），不联网。Codex 跑过一轮后才有数据。",
          "en": "Reads the limits in Codex's session logs on this computer (sessions under `CODEX_HOME` or ~/.codex, as the Agent page does), with no network access. Numbers appear after Codex has run a turn."
        },
        "default": false
      },
      {
        "key": "glm",
        "type": "boolean",
        "title": { "zh-CN": "GLM（智谱 Coding Plan）", "en": "GLM (Zhipu Coding Plan)" },
        "description": {
          "zh-CN": "用本页下方保存的智谱开放平台 API Key，每分钟最多一次直连 open.bigmodel.cn 查询 GLM Coding Plan 的 5 小时、每周和 MCP 月度额度。Key 存在 Windows 凭据管理器里，只发给智谱。",
          "en": "Asks open.bigmodel.cn directly, at most once a minute, for the GLM Coding Plan's 5-hour, weekly and monthly MCP limits with the Zhipu open platform API key saved below. The key lives in the Windows Credential Manager and goes to Zhipu only."
        },
        "default": false
      },
      {
        "key": "kimi",
        "type": "boolean",
        "title": { "zh-CN": "Kimi（Kimi Code 会员）", "en": "Kimi (Kimi Code plan)" },
        "description": {
          "zh-CN": "用本页下方保存的 Kimi Code API Key，每分钟最多一次直连 api.kimi.com 查询 5 小时、每周或本月额度。Key 存在 Windows 凭据管理器里，只发给 Kimi。",
          "en": "Asks api.kimi.com directly, at most once a minute, for the 5-hour, weekly or monthly limits with the Kimi Code API key saved below. The key lives in the Windows Credential Manager and goes to Kimi only."
        },
        "default": false
      },
      {
        "key": "show",
        "type": "select",
        "title": { "zh-CN": "环和悬停卡片显示", "en": "Rings and card show" },
        "default": "used",
        "options": [
          { "value": "used", "title": { "zh-CN": "已用", "en": "Used" } },
          { "value": "remaining", "title": { "zh-CN": "剩余", "en": "Left" } }
        ]
      },
      {
        "key": "askAnthropic",
        "type": "boolean",
        "title": { "zh-CN": "Claude Code：直接向 Anthropic 查询", "en": "Claude Code: ask Anthropic directly" },
        "description": {
          "zh-CN": "打开后，岛屿会读取本机 Claude Code 保存的登录令牌（~/.claude/.credentials.json，只读，不刷新、不改写，也不会发给 Anthropic 以外的地方），按下面的间隔经代理请求 api.anthropic.com 的用量接口。这个接口没有公开文档，可能随时失效，失效时退回 claude-hud 的快照。Agent 页顶部的用量也会用这份数据。",
          "en": "When on, the island reads the login token Claude Code saved on this computer (~/.claude/.credentials.json; read only, never renewed or rewritten, sent nowhere but Anthropic) and asks api.anthropic.com's usage endpoint through a proxy at the interval below. The endpoint is undocumented and may stop working at any time; the island then falls back to claude-hud's snapshot. The Agent page's usage line uses these numbers too."
        },
        "default": false
      },
      {
        "key": "proxy",
        "type": "string",
        "title": { "zh-CN": "Claude Code：代理地址", "en": "Claude Code: proxy" },
        "description": {
          "zh-CN": "http:// 或 https:// 代理，例如 http://127.0.0.1:7890。留空时依次用 HTTPS_PROXY 环境变量和 Windows 的系统代理；都没有就不请求，不会绕过代理直连。",
          "en": "An http:// or https:// proxy, such as http://127.0.0.1:7890. Empty uses the HTTPS_PROXY environment variable, then the Windows proxy; without either nothing is sent, never directly."
        },
        "default": ""
      },
      {
        "key": "intervalMinutes",
        "type": "number",
        "title": { "zh-CN": "Claude Code：刷新间隔（分钟）", "en": "Claude Code: refresh every (minutes)" },
        "min": 5,
        "max": 120,
        "default": 5
      }
    ]
  }
}"#;

const SESSION_RING_MANIFEST: &str = r#"{
  "id": "focusd.session-ring",
  "name": { "zh-CN": "Agent 会话环", "en": "Agent session ring" },
  "description": {
    "zh-CN": "在收起条上代替蓝色会话数，四种样式：每个会话一个像素格（最多 3 × 3）、中间写会话数的分段小环、会话数加一段状态条、信号格（每种颜色一根柱子，每个会话一格横条，柱子越高会话越多）。等你确认、等你回复、运行、完成各有颜色，悬停列出等你处理的会话，点击打开 Agent 页。显示的就是 Agent 页列出的会话（Claude Code 和 Codex），跟着它隐藏、移除；需要开启 AI Agent。",
    "en": "Takes the blue session count's place on the collapsed bar, in one of four styles: a pixel per session (up to 3 × 3), a small segmented ring with the count in the middle, the count with a state bar, or signal bars (a column per colour, a bar per session, so the taller the column the more sessions). Needs you, your turn, running and done each have a colour; hovering lists the sessions waiting on you and a click opens the Agent page. It shows exactly the sessions the Agent page lists (Claude Code and Codex) and drops them as the page hides or removes them; needs AI Agent switched on."
  },
  "version": "1.1.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "style",
        "type": "select",
        "title": { "zh-CN": "样式", "en": "Style" },
        "default": "ring",
        "options": [
          { "value": "grid", "title": { "zh-CN": "像素格", "en": "Pixel grid" } },
          { "value": "ring", "title": { "zh-CN": "分段环", "en": "Segmented ring" } },
          { "value": "bar", "title": { "zh-CN": "状态条", "en": "State bar" } },
          { "value": "signal", "title": { "zh-CN": "信号格", "en": "Signal bars" } }
        ]
      },
      {
        "key": "showCount",
        "type": "boolean",
        "title": { "zh-CN": "显示会话数", "en": "Show the count" },
        "description": {
          "zh-CN": "分段环中间和状态条前面的数字。关掉后只看颜色比例；像素格和信号格本来就不写数字。",
          "en": "The number in the segmented ring and before the state bar. Off, only the colours' shares show; the pixel grid and signal bars have no number anyway."
        },
        "default": true
      }
    ]
  }
}"#;

pub(super) const SSH_TUNNEL_ID: &str = "focusd.ssh-proxy-tunnel";

// The hosts, their switches and ports there are not plugin settings: the plugin page lists them
// from the SSH list (src/features/ssh-tunnel) and they live in ssh-tunnels.json (ssh_tunnel/).
const SSH_TUNNEL_MANIFEST: &str = r#"{
  "id": "focusd.ssh-proxy-tunnel",
  "name": { "zh-CN": "SSH 代理隧道", "en": "SSH proxy tunnel" },
  "description": {
    "zh-CN": "把这台电脑的代理借给 SSH 服务器：为下面打开的每台主机常驻一条 ssh 反向隧道（服务器上的 127.0.0.1:端口 → 这里的本地代理），服务器上设好 http_proxy 就能经这里上网。主机来自 ~/.ssh/config 和 AI Agent 页添加的电脑，只用密钥登录；断开后自动重连，关闭插件或退出岛屿时隧道一起结束。",
    "en": "Lends this computer's proxy to SSH servers: for each host switched on below, a resident ssh reverse tunnel (127.0.0.1:port on the server to the local proxy here), so the server reaches the internet through here once http_proxy is set there. Hosts come from ~/.ssh/config and the computers added on the AI Agent page, key login only; it reconnects after a drop, and the tunnels end when the plugin is switched off or the island quits."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "localProxy",
        "type": "select",
        "title": { "zh-CN": "本地代理", "en": "Local proxy" },
        "description": {
          "zh-CN": "隧道转发到这台电脑上的哪个代理端口。自动检测依次看 Clash Verge 的设置、正在运行的 v2rayN 的设置和 Windows 系统代理，再试两者的默认端口，用第一个真有程序在监听的；之后每 15 秒再看一次，端口变了隧道跟着换。选 Clash Verge 或 v2rayN 时也先读它们的设置，读不到才用默认端口（7897、10808）。",
          "en": "Which proxy port on this computer the tunnels forward to. Auto looks in turn at Clash Verge's settings, a running v2rayN's settings and the Windows system proxy, then tries both apps' default ports, and takes the first one something listens on; it looks again every 15 seconds and moves the tunnels when the port changes. Clash Verge and v2rayN also read the app's settings first, and use the default port (7897, 10808) only when there are none."
        },
        "default": "auto",
        "options": [
          { "value": "auto", "title": { "zh-CN": "自动检测", "en": "Auto" } },
          { "value": "clash-verge", "title": { "zh-CN": "Clash Verge（默认 7897）", "en": "Clash Verge (7897 by default)" } },
          { "value": "v2rayn", "title": { "zh-CN": "v2rayN（默认 10808）", "en": "v2rayN (10808 by default)" } },
          { "value": "custom", "title": { "zh-CN": "自定义端口", "en": "Custom port" } }
        ]
      },
      {
        "key": "customPort",
        "type": "number",
        "title": { "zh-CN": "本地端口", "en": "Local port" },
        "min": 1,
        "max": 65535,
        "default": 7897
      }
    ]
  }
}"#;

// Works in the windows (src/features/cc-connect): the plugin page shows what was found, and the
// phone push (Settings → AI Agent → Alerts) sends through it. Nothing runs here yet.
pub(super) const CC_CONNECT_ID: &str = "focusd.cc-connect";

const CC_CONNECT_MANIFEST: &str = r#"{
  "id": "focusd.cc-connect",
  "name": { "zh-CN": "cc-connect 手机连接", "en": "cc-connect phone link" },
  "description": {
    "zh-CN": "让手机推送经 cc-connect 的机器人发到 Telegram、Discord 或飞书：Agent 等你时把问题、计划或回复连同接管命令发到手机，在手机上回 /cd、/switch 就能接着这个会话答。没装 cc-connect 也行：插件页可以下载它、一步步建好机器人，并由岛让它一直运行。",
    "en": "Sends the phone push through cc-connect's bots on Telegram, Discord or Feishu: when an agent waits for you, its question, plan or reply goes to your phone with the commands to take the session over there (/cd, /switch). No cc-connect yet? The plugin page downloads it, sets a bot up step by step, and the island keeps it running."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "path",
        "type": "string",
        "title": { "zh-CN": "cc-connect 程序路径", "en": "cc-connect program" },
        "description": {
          "zh-CN": "留空自动找：正在运行的 cc-connect、PATH（npm i -g cc-connect 装在这里）、插件页下载的那份，再看 C、D 盘 Program Files 和 Program Files (x86) 下的 cc-connect 文件夹。不搜全盘。",
          "en": "Leave empty to find it: the running cc-connect, PATH (where npm i -g cc-connect puts it), the one downloaded on this page, then a cc-connect folder in Program Files or Program Files (x86) on C: and D:. The disks are not searched."
        },
        "default": ""
      },
      {
        "key": "run",
        "type": "boolean",
        "title": { "zh-CN": "由岛启动 cc-connect", "en": "Keep cc-connect running" },
        "description": {
          "zh-CN": "岛开着时让 cc-connect 在后台一直运行（不弹窗口，退出岛时一起退出）。已经在别处运行的 cc-connect 不接管。",
          "en": "While the island runs, cc-connect runs in the background too (no window, it ends with the island). A cc-connect started elsewhere is left alone."
        },
        "default": false
      }
    ]
  }
}"#;

/// Every built-in plugin: its id, its manifest (whose "id" must match), and
/// whether it has work in this process (`native`, see `start` and `stop`).
pub(super) const BUILTINS: &[(&str, &str, bool)] = &[
    (LOCAL_API_ID, LOCAL_API_MANIFEST, true),
    ("focusd.center-pattern", CENTER_PATTERN_MANIFEST, false),
    (CLAUDE_USAGE_ID, CLAUDE_USAGE_MANIFEST, true),
    ("focusd.session-ring", SESSION_RING_MANIFEST, false),
    (SSH_TUNNEL_ID, SSH_TUNNEL_MANIFEST, true),
    (CC_CONNECT_ID, CC_CONNECT_MANIFEST, true),
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

/// The usage ring's direct-request settings; None while "ask Anthropic directly" is off.
pub(super) fn claude_usage_config(settings: &Map<String, Value>) -> Option<claude_usage::UsageConfig> {
    if !settings.get(CLAUDE_USAGE_ASK_ANTHROPIC).and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let proxy = settings
        .get("proxy")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|proxy| !proxy.is_empty())
        .map(str::to_string);
    Some(claude_usage::UsageConfig {
        proxy,
        interval_minutes: settings.get("intervalMinutes").and_then(Value::as_u64).unwrap_or(5),
    })
}

/// Starts or stops the direct requests to match the settings; the ring itself lives in the window.
fn apply_claude_usage(settings: &Map<String, Value>) -> Result<(), String> {
    match claude_usage_config(settings) {
        Some(config) => claude_usage::start(config),
        None => {
            claude_usage::stop();
            Ok(())
        }
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
        CLAUDE_USAGE_ID => apply_claude_usage(settings).map(|()| Vec::new()),
        SSH_TUNNEL_ID => ssh_tunnel::start(settings).map(|()| Vec::new()),
        CC_CONNECT_ID => cc_connect::apply(settings).map(|()| Vec::new()),
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
        SSH_TUNNEL_ID => {
            ssh_tunnel::stop();
            Ok(())
        }
        CC_CONNECT_ID => {
            cc_connect::stop();
            Ok(())
        }
        _ => Ok(()),
    }
}

pub(super) fn settings_changed(id: &str, settings: &Map<String, Value>) -> Result<(), String> {
    match id {
        LOCAL_API_ID => local_api::set_allow_write(allow_write(settings)),
        CLAUDE_USAGE_ID => apply_claude_usage(settings),
        SSH_TUNNEL_ID => ssh_tunnel::start(settings),
        CC_CONNECT_ID => cc_connect::apply(settings),
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
