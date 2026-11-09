//! InfLink-rs (https://github.com/apoint123/InfLink-rs), a BetterNCM plugin that makes NetEase
//! Cloud Music report its playback position and song id to Windows. With it the music page has
//! a real progress bar and lyrics are looked up by id. The island installs only the plugin: one
//! `.plugin` file put in BetterNCM's `plugins` folder. BetterNCM itself, a DLL placed in NetEase's
//! program folder, is left for the user to install; the island never writes there.

use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::system::updater::get_updater_proxy;

const PLUGIN_NAME: &str = "InfLink-rs";
const FILE_NAME: &str = "InfLink-rs.plugin";
const LATEST_RELEASE: &str = "https://api.github.com/repos/apoint123/InfLink-rs/releases/latest";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION"), " (https://github.com/TixXin/fly-island)");
/// The 3.4.0 package is 1.6 MB; anything far larger is not the plugin.
const MAX_PACKAGE_BYTES: u64 = 32 * 1024 * 1024;

/// What the settings page shows. Mirrored by `InflinkState` in src/features/media/lyrics/inflink.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InflinkState {
    /// BetterNCM's data folder, when one was found; without it the plugin has nowhere to go.
    better_ncm: Option<String>,
    /// The version of the InfLink-rs package in its plugins folder.
    installed: Option<String>,
    /// The newest release on GitHub; null when GitHub could not be asked.
    latest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Debug, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    /// `sha256:<hex>`, which GitHub computes for each asset.
    #[serde(default)]
    digest: Option<String>,
}

/// Where BetterNCM keeps its data, in the order it looks: `BETTERNCM_PROFILE`, then `C:\betterncm`.
/// The user folder is also tried, where some installers put it.
fn data_dir_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(profile) = std::env::var_os("BETTERNCM_PROFILE").filter(|value| !value.is_empty()) {
        candidates.push(PathBuf::from(profile));
    }
    candidates.push(PathBuf::from(r"C:\betterncm"));
    if let Some(home) = std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()) {
        candidates.push(PathBuf::from(home).join("betterncm"));
    }
    candidates
}

fn find_data_dir() -> Option<PathBuf> {
    data_dir_candidates().into_iter().find(|dir| dir.is_dir())
}

/// The name and version in a `.plugin` package (a zip with `manifest.json` at its root).
fn read_manifest(package: &[u8]) -> Result<(String, String), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(package)).map_err(|error| format!("The package is not a valid zip: {error}"))?;
    let mut file = archive.by_name("manifest.json").map_err(|_| "The package has no manifest.json".to_string())?;
    let mut text = String::new();
    file.by_ref().take(64 * 1024).read_to_string(&mut text).map_err(|error| format!("Could not read manifest.json: {error}"))?;
    let manifest: Manifest = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|error| format!("manifest.json is not valid: {error}"))?;
    Ok((manifest.name, manifest.version))
}

/// The InfLink-rs package already in `plugins`, with its version: the usual file name first,
/// then any other `.plugin` whose manifest names it (a copy the user put there by hand).
fn installed_package(plugins: &Path) -> Option<(PathBuf, String)> {
    let usual = plugins.join(FILE_NAME);
    let others = fs::read_dir(plugins).ok()?.filter_map(Result::ok).map(|entry| entry.path());
    std::iter::once(usual)
        .chain(others)
        .filter(|path| path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("plugin")) && path.is_file())
        .find_map(|path| {
            let bytes = fs::read(&path).ok()?;
            let (name, version) = read_manifest(&bytes).ok()?;
            (name == PLUGIN_NAME).then_some((path, version))
        })
}

/// `v3.4.0` → `3.4.0`.
fn version_of_tag(tag: &str) -> String {
    tag.trim().trim_start_matches(['v', 'V']).to_string()
}

/// The release's `.plugin` asset and the SHA-256 GitHub gives for it.
fn plugin_asset(release: &Release) -> Result<(&Asset, String), String> {
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name.to_ascii_lowercase().ends_with(".plugin"))
        .ok_or("The latest InfLink-rs release has no .plugin file")?;
    let hash = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .filter(|hex| hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .ok_or("GitHub gave no checksum for the InfLink-rs package, so it was not installed")?;
    Ok((asset, hash.to_ascii_lowercase()))
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).user_agent(USER_AGENT);
    // Same proxy as the updater: GitHub is often slow or blocked without one.
    if let Some(proxy) = get_updater_proxy() {
        let proxy = reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

async fn latest_release(client: &reqwest::Client) -> Result<Release, String> {
    let response = client
        .get(LATEST_RELEASE)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("Could not reach GitHub: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("GitHub answered {} for the latest InfLink-rs release", response.status()));
    }
    response.json().await.map_err(|error| format!("GitHub's answer was not understood: {error}"))
}

async fn download(client: &reqwest::Client, asset: &Asset) -> Result<Vec<u8>, String> {
    if asset.size > MAX_PACKAGE_BYTES {
        return Err(format!("The InfLink-rs package is unexpectedly large ({} bytes)", asset.size));
    }
    let response = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|error| format!("Could not download InfLink-rs: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Downloading InfLink-rs failed: {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|error| format!("Could not download InfLink-rs: {error}"))?;
    if bytes.len() as u64 > MAX_PACKAGE_BYTES {
        return Err("The InfLink-rs package is unexpectedly large".into());
    }
    Ok(bytes.to_vec())
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Writes the package next to the old one, then swaps it in, so a failed write leaves the old one.
fn write_package(target: &Path, package: &[u8]) -> Result<(), String> {
    let partial = target.with_extension("plugin.download");
    fs::write(&partial, package).map_err(|error| format!("Could not write {}: {error}", partial.display()))?;
    fs::rename(&partial, target).map_err(|error| {
        let _ = fs::remove_file(&partial);
        format!("Could not put InfLink-rs in {}: {error}", target.display())
    })
}

fn local_state() -> (Option<PathBuf>, Option<(PathBuf, String)>) {
    let data_dir = find_data_dir();
    let installed = data_dir.as_deref().and_then(|dir| installed_package(&dir.join("plugins")));
    (data_dir, installed)
}

async fn local_state_off_thread() -> Result<(Option<PathBuf>, Option<(PathBuf, String)>), String> {
    tauri::async_runtime::spawn_blocking(local_state)
        .await
        .map_err(|error| format!("Failed to look for BetterNCM: {error}"))
}

/// Whether BetterNCM and InfLink-rs are installed and, when asked, the newest InfLink-rs release.
pub(super) async fn state(check_latest: bool) -> Result<InflinkState, String> {
    let (data_dir, installed) = local_state_off_thread().await?;
    let latest = if check_latest && data_dir.is_some() {
        match client() {
            Ok(client) => latest_release(&client).await.ok().map(|release| version_of_tag(&release.tag_name)),
            Err(_) => None,
        }
    } else {
        None
    };
    Ok(InflinkState {
        better_ncm: data_dir.map(|dir| dir.display().to_string()),
        installed: installed.map(|(_, version)| version),
        latest,
    })
}

/// Downloads the newest InfLink-rs, checks it against GitHub's checksum and its manifest, and
/// puts it in BetterNCM's plugins folder (over the old package, wherever that was).
pub(super) async fn install() -> Result<InflinkState, String> {
    let (data_dir, installed) = local_state_off_thread().await?;
    let data_dir = data_dir.ok_or("BetterNCM was not found. Install BetterNCM first, open NetEase Cloud Music once, then try again.")?;
    let client = client()?;
    let release = latest_release(&client).await?;
    let (asset, hash) = plugin_asset(&release)?;
    let package = download(&client, asset).await?;
    if sha256_hex(&package) != hash {
        return Err("The downloaded InfLink-rs package does not match GitHub's checksum, so it was not installed".into());
    }
    let (name, version) = read_manifest(&package)?;
    if name != PLUGIN_NAME {
        return Err(format!("The downloaded package is \"{name}\", not InfLink-rs"));
    }
    let plugins = data_dir.join("plugins");
    let target = installed.map(|(path, _)| path).unwrap_or_else(|| plugins.join(FILE_NAME));
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&plugins).map_err(|error| format!("Could not create {}: {error}", plugins.display()))?;
        write_package(&target, &package)
    })
    .await
    .map_err(|error| format!("Failed to write InfLink-rs: {error}"))??;
    Ok(InflinkState {
        better_ncm: Some(data_dir.display().to_string()),
        installed: Some(version.clone()),
        latest: Some(version_of_tag(&release.tag_name)),
    })
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    fn package(manifest: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut bytes));
            writer.start_file("manifest.json", zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(manifest.as_bytes()).unwrap();
            writer.finish().unwrap();
        }
        bytes
    }

    fn release(digest: Option<&str>) -> Release {
        Release {
            tag_name: "v3.4.0".into(),
            assets: vec![
                Asset { name: "notes.txt".into(), browser_download_url: String::new(), size: 1, digest: None },
                Asset { name: "InfLink-rs.plugin".into(), browser_download_url: "https://example.com/p".into(), size: 1, digest: digest.map(Into::into) },
            ],
        }
    }

    #[test]
    fn the_manifest_gives_name_and_version() {
        let bytes = package("\u{feff}{\"name\": \"InfLink-rs\", \"version\": \"3.4.0\", \"injects\": {}}");
        assert_eq!(read_manifest(&bytes).unwrap(), ("InfLink-rs".to_string(), "3.4.0".to_string()));
        assert!(read_manifest(b"not a zip").is_err());
    }

    #[test]
    fn the_plugin_asset_needs_a_sha256_from_github() {
        let hex = "7D0B7B863B072A99B88EB614C788099315E690920889AACA22685D3663661468";
        let with = release(Some(&format!("sha256:{hex}")));
        let (asset, hash) = plugin_asset(&with).unwrap();
        assert_eq!(asset.name, "InfLink-rs.plugin");
        assert_eq!(hash, hex.to_ascii_lowercase());
        assert!(plugin_asset(&release(None)).is_err());
        assert!(plugin_asset(&release(Some("sha256:abc"))).is_err());
        assert_eq!(version_of_tag(" v3.4.0"), "3.4.0");
    }

    #[test]
    fn the_installed_package_is_found_by_its_manifest() {
        let dir = std::env::temp_dir().join(format!("focusd-inflink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(installed_package(&dir), None);
        fs::write(dir.join("Other.plugin"), package("{\"name\": \"Other\", \"version\": \"1.0.0\"}")).unwrap();
        fs::write(dir.join("inflink-manual.plugin"), package("{\"name\": \"InfLink-rs\", \"version\": \"3.3.0\"}")).unwrap();
        assert_eq!(installed_package(&dir), Some((dir.join("inflink-manual.plugin"), "3.3.0".to_string())));
        write_package(&dir.join("inflink-manual.plugin"), &package("{\"name\": \"InfLink-rs\", \"version\": \"3.4.0\"}")).unwrap();
        assert_eq!(installed_package(&dir).map(|(_, version)| version), Some("3.4.0".to_string()));
        assert!(!dir.join("inflink-manual.plugin.download").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
