//! Where this computer's proxy takes requests (the `localProxy` setting). Auto, the default, asks
//! in turn Clash Verge's settings, a running v2rayN's settings and the Windows system proxy, then
//! the two apps' default ports, and takes the first port something listens on: a port read from an
//! app's own settings is that app's proxy, and the listening check says whether it runs now.

use std::{
    net::{Ipv4Addr, SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::Serialize;
use serde_json::{Map, Value};

const CLASH_VERGE_PORT: u16 = 7897;
/// v2rayN's local mixed (socks + http) port; before 7.0 http was 10809.
const V2RAYN_PORT: u16 = 10808;
/// Windows retries the SYN to a loopback port nothing listens on instead of failing at once.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

/// The proxy the settings pick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Choice {
    Auto,
    ClashVerge,
    V2rayN,
    Custom(u16),
}

/// Where the port came from. Mirrored by `SshTunnelProxy.found` in src/features/ssh-tunnel/api.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Found {
    ClashVerge,
    V2rayN,
    SystemProxy,
    ClashVergeDefault,
    V2rayNDefault,
    Custom,
}

/// The proxy the tunnels forward to. Mirrored by `SshTunnelProxy` in src/features/ssh-tunnel/api.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalProxy {
    pub(super) port: u16,
    pub(super) found: Found,
    pub(super) listening: bool,
}

/// `localProxy`: auto (also when missing), clash-verge, v2rayn or custom (then `customPort`, 1–65535).
pub(super) fn choice(settings: &Map<String, Value>) -> Result<Choice, String> {
    match settings.get("localProxy").and_then(Value::as_str) {
        Some("clash-verge") => Ok(Choice::ClashVerge),
        Some("v2rayn") => Ok(Choice::V2rayN),
        Some("custom") => settings
            .get("customPort")
            .and_then(Value::as_u64)
            .and_then(|port| u16::try_from(port).ok())
            .filter(|&port| port > 0)
            .map(Choice::Custom)
            .ok_or_else(|| "The local proxy port must be a whole number from 1 to 65535".to_string()),
        _ => Ok(Choice::Auto),
    }
}

/// Where the chosen proxy is now. `current` is where it was last time.
pub(super) fn find(choice: Choice, current: Option<LocalProxy>) -> LocalProxy {
    let checked = |(port, found): (u16, Found)| LocalProxy { port, found, listening: listening(port) };
    match choice {
        Choice::Auto => pick(&candidates(), listening, current),
        Choice::ClashVerge => checked(clash_verge_port().map_or((CLASH_VERGE_PORT, Found::ClashVergeDefault), |port| (port, Found::ClashVerge))),
        Choice::V2rayN => checked(v2rayn_port().map_or((V2RAYN_PORT, Found::V2rayNDefault), |port| (port, Found::V2rayN))),
        Choice::Custom(port) => checked((port, Found::Custom)),
    }
}

/// Auto's ports, most telling first.
fn candidates() -> Vec<(u16, Found)> {
    [
        clash_verge_port().map(|port| (port, Found::ClashVerge)),
        v2rayn_port().map(|port| (port, Found::V2rayN)),
        system_proxy_port().map(|port| (port, Found::SystemProxy)),
        Some((CLASH_VERGE_PORT, Found::ClashVergeDefault)),
        Some((V2RAYN_PORT, Found::V2rayNDefault)),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// The first candidate something listens on. With none, `current` while it still is a candidate
/// (a proxy app not started yet does not move the tunnels about), else the first one.
pub(super) fn pick(candidates: &[(u16, Found)], mut listening: impl FnMut(u16) -> bool, current: Option<LocalProxy>) -> LocalProxy {
    let mut down: Vec<u16> = Vec::new();
    for &(port, found) in candidates {
        if down.contains(&port) {
            continue;
        }
        if listening(port) {
            return LocalProxy { port, found, listening: true };
        }
        down.push(port);
    }
    let (port, found) = current
        .map(|current| (current.port, current.found))
        .filter(|current| candidates.contains(current))
        .or_else(|| candidates.first().copied())
        .unwrap_or((CLASH_VERGE_PORT, Found::ClashVergeDefault));
    LocalProxy { port, found, listening: false }
}

fn listening(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, port)), CONNECT_TIMEOUT).is_ok()
}

/// Clash Verge Rev's mixed port: its core runs `clash-verge.yaml`, written from the app's own
/// settings (`verge.yaml`), so that one is read first.
fn clash_verge_port() -> Option<u16> {
    let dir = PathBuf::from(std::env::var_os("APPDATA")?).join("io.github.clash-verge-rev.clash-verge-rev");
    let read = |file: &str, key: &str| std::fs::read_to_string(dir.join(file)).ok().and_then(|text| yaml_port(&text, key));
    read("clash-verge.yaml", "mixed-port").or_else(|| read("verge.yaml", "verge_mixed_port"))
}

/// A top-level `key: <port>` line of a YAML file, such as Clash's `mixed-port: 7897`.
/// shortcut: one plain line, not YAML; enough for the files Clash Verge writes, a YAML crate if a
/// flow mapping or an anchor ever holds the port.
pub(super) fn yaml_port(text: &str, key: &str) -> Option<u16> {
    text.lines().find_map(|line| {
        let value = line.strip_prefix(key)?.strip_prefix(':')?;
        let value = value.split('#').next()?.trim().trim_matches(|c| c == '\'' || c == '"');
        value.parse().ok().filter(|&port| port > 0)
    })
}

/// A running v2rayN's local port, from `guiConfigs/guiNConfig.json` beside it: it keeps its
/// settings in its own folder, wherever it was unpacked.
fn v2rayn_port() -> Option<u16> {
    let exe = crate::win32::process::running_executable(&["v2rayN.exe"])?;
    let config = Path::new(&exe).parent()?.join("guiConfigs").join("guiNConfig.json");
    v2rayn_config_port(&std::fs::read_to_string(config).ok()?)
}

/// `Inbound[0].LocalPort` of v2rayN's settings: since 7.0 a mixed port, so http too.
/// shortcut: v2rayN 6 took http one port higher; read its version if anyone still runs 6.
pub(super) fn v2rayn_config_port(text: &str) -> Option<u16> {
    let config: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    let port = config.get("Inbound")?.get(0)?.get("LocalPort")?.as_u64()?;
    u16::try_from(port).ok().filter(|&port| port > 0)
}

/// The Windows system proxy's port when it is on and on this computer (what Clash Verge and
/// v2rayN set when their system proxy switch is on).
fn system_proxy_port() -> Option<u16> {
    use windows::Win32::System::Registry::HKEY_CURRENT_USER;
    let enabled = crate::win32::registry::read_u32(HKEY_CURRENT_USER, INTERNET_SETTINGS, "ProxyEnable")?;
    let server = crate::win32::registry::read_string(HKEY_CURRENT_USER, INTERNET_SETTINGS, "ProxyServer")?;
    (enabled != 0).then(|| loopback_port(&server)).flatten()
}

/// The port of a `ProxyServer` value on this computer: `127.0.0.1:7897` for every scheme, or
/// `http=127.0.0.1:7899;https=…;socks=…`, whose http entry is the one the tunnel can carry.
pub(super) fn loopback_port(server: &str) -> Option<u16> {
    let entry = if server.contains('=') {
        server.split(';').find_map(|part| {
            let (scheme, address) = part.split_once('=')?;
            scheme.trim().eq_ignore_ascii_case("http").then_some(address)
        })?
    } else {
        server
    };
    let entry = entry.trim();
    let (host, port) = entry.strip_prefix("http://").unwrap_or(entry).rsplit_once(':')?;
    let port = port.trim_end_matches('/').parse().ok().filter(|&port: &u16| port > 0)?;
    matches!(host, "127.0.0.1" | "localhost").then_some(port)
}
