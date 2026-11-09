//! Downloads cc-connect's latest release for this Windows from GitHub into
//! `<app data>/cc-connect/<tag>/cc-connect.exe`, where `locate` finds it. The zip must match the
//! SHA-256 in the release's `checksums.txt`, and both must come from the project's own release
//! downloads. Through the same proxy as the update check.

use std::{
    fs::{self, File},
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::locate::{EXE_NAME, FOLDER};
use crate::system::updater::get_updater_proxy;

const LATEST: &str = "https://api.github.com/repos/chenhg5/cc-connect/releases/latest";
const DOWNLOADS: &str = "https://github.com/chenhg5/cc-connect/releases/download/";
const MAX_TEXT: u64 = 1 << 20;
const MAX_ZIP: u64 = 100 << 20;
const MAX_EXE: u64 = 300 << 20;
const TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// The program, downloaded unless this release is there already.
pub(super) async fn install(app_dir: PathBuf) -> Result<PathBuf, String> {
    let client = client()?;
    let release: Release =
        serde_json::from_slice(&get(&client, LATEST, MAX_TEXT).await?).map_err(|error| format!("Could not read GitHub's release: {error}"))?;
    let tag = release.tag_name.as_str();
    if tag.is_empty() || !tag.bytes().all(|byte| byte.is_ascii_alphanumeric() || b".-_".contains(&byte)) {
        return Err(format!("cc-connect's version tag is not valid: {tag}"));
    }
    let dir = app_dir.join(FOLDER).join(tag);
    let exe = dir.join(EXE_NAME);
    if exe.is_file() {
        return Ok(exe);
    }
    let zip_name = asset_name(tag, std::env::consts::ARCH)?;
    let url_of = |name: &str| {
        release
            .assets
            .iter()
            .find(|asset| asset.name == name && asset.browser_download_url.starts_with(DOWNLOADS))
            .map(|asset| asset.browser_download_url.as_str())
            .ok_or_else(|| format!("cc-connect {tag} has no {name}."))
    };
    let sums = get(&client, url_of("checksums.txt")?, MAX_TEXT).await?;
    let expected = checksum_for(&String::from_utf8_lossy(&sums), &zip_name).ok_or_else(|| format!("checksums.txt does not list {zip_name}."))?;
    let zip = get(&client, url_of(&zip_name)?, MAX_ZIP).await?;
    let actual: String = Sha256::digest(&zip).iter().map(|byte| format!("{byte:02x}")).collect();
    if actual != expected {
        return Err("The downloaded cc-connect does not match the release's checksum; it was thrown away.".into());
    }
    tauri::async_runtime::spawn_blocking(move || unpack(&zip, &dir, &exe).map(|()| exe))
        .await
        .map_err(|error| format!("Failed to join the unpack task: {error}"))?
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = get_updater_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

async fn get(client: &reqwest::Client, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach {url}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} answered {}.", response.status()));
    }
    if response.content_length().is_some_and(|length| length > limit) {
        return Err(format!("{url} is larger than {limit} bytes."));
    }
    let bytes = response.bytes().await.map_err(|error| format!("Could not download {url}: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err(format!("{url} is larger than {limit} bytes."));
    }
    Ok(bytes.to_vec())
}

/// `cc-connect-<tag>-windows-<amd64|arm64>.zip`, the release's name for this CPU.
fn asset_name(tag: &str, arch: &str) -> Result<String, String> {
    let arch = match arch {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => return Err(format!("cc-connect has no Windows build for {other}.")),
    };
    Ok(format!("cc-connect-{tag}-windows-{arch}.zip"))
}

/// The lowercase SHA-256 `checksums.txt` gives `name` (`<hash>  <name>` lines, as sha256sum writes).
fn checksum_for(sums: &str, name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, file) = line.trim().split_once(char::is_whitespace)?;
        let file = file.trim().trim_start_matches('*');
        (file == name && hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())).then(|| hash.to_ascii_lowercase())
    })
}

/// Writes the zip's one .exe to `exe` (in `dir`), through a `.part` file so a cut-off write is never found.
fn unpack(zip: &[u8], dir: &Path, exe: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(zip)).map_err(|error| format!("Could not open the cc-connect zip: {error}"))?;
    let index = (0..archive.len())
        .find(|&index| {
            archive
                .by_index(index)
                .is_ok_and(|file| file.is_file() && file.name().is_ok_and(|name| name.to_ascii_lowercase().ends_with(".exe")))
        })
        .ok_or("The cc-connect zip has no program in it.")?;
    let file = archive.by_index(index).map_err(|error| format!("Could not read the cc-connect zip: {error}"))?;
    if file.size() > MAX_EXE {
        return Err("The cc-connect program is unusually large; gave up.".into());
    }
    fs::create_dir_all(dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    let part = dir.join(format!("{EXE_NAME}.part"));
    let mut out = File::create(&part).map_err(|error| format!("Could not write {}: {error}", part.display()))?;
    io::copy(&mut file.take(MAX_EXE), &mut out).map_err(|error| format!("Could not unpack cc-connect: {error}"))?;
    drop(out);
    fs::rename(&part, exe).map_err(|error| format!("Could not put {} in place: {error}", exe.display()))
}

#[cfg(test)]
mod tests {
    use super::{asset_name, checksum_for, install, unpack};
    use std::{fs, io::Write};

    #[test]
    #[ignore = "downloads cc-connect from GitHub"]
    fn downloads_the_latest_release_and_it_runs() {
        let dir = std::env::temp_dir().join(format!("focusd-cc-connect-install-{}", std::process::id()));
        let exe = tauri::async_runtime::block_on(install(dir.clone())).unwrap();
        let version = std::process::Command::new(&exe).arg("--version").output().unwrap();
        assert!(String::from_utf8_lossy(&version.stdout).contains("cc-connect"), "{version:?}");
        // A second time finds it there.
        assert_eq!(tauri::async_runtime::block_on(install(dir.clone())).unwrap(), exe);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_windows_zip_for_this_cpu() {
        assert_eq!(asset_name("v1.5.0", "x86_64").unwrap(), "cc-connect-v1.5.0-windows-amd64.zip");
        assert_eq!(asset_name("v1.5.0", "aarch64").unwrap(), "cc-connect-v1.5.0-windows-arm64.zip");
        assert!(asset_name("v1.5.0", "x86").is_err());
    }

    #[test]
    fn the_checksum_of_exactly_that_file() {
        let hash = "1d0fdeffa6118ab0a942a3c3918930685bd7d4caef5d7311b0d8f605fad95763";
        let sums = format!(
            "{}  cc-connect-v1.5.0-windows-amd64.exe\n{}  cc-connect-v1.5.0-windows-amd64.zip\nnot a line\n",
            "b".repeat(64),
            hash.to_uppercase()
        );
        assert_eq!(checksum_for(&sums, "cc-connect-v1.5.0-windows-amd64.zip").as_deref(), Some(hash));
        assert_eq!(checksum_for(&format!("{hash} *a.zip"), "a.zip").as_deref(), Some(hash));
        assert_eq!(checksum_for("abc  a.zip", "a.zip"), None);
        assert_eq!(checksum_for(&sums, "cc-connect-v1.5.0-windows-arm64.zip"), None);
    }

    #[test]
    fn the_zip_s_exe_lands_as_cc_connect_exe() {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        zip.start_file("README.md", zip::write::SimpleFileOptions::default()).unwrap();
        zip.start_file("cc-connect-v1.5.0-windows-amd64.exe", zip::write::SimpleFileOptions::default()).unwrap();
        zip.write_all(b"MZ program").unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        let dir = std::env::temp_dir().join(format!("focusd-cc-connect-unpack-{}", std::process::id()));
        let exe = dir.join("cc-connect.exe");
        unpack(&bytes, &dir, &exe).unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"MZ program");
        assert!(!dir.join("cc-connect.exe.part").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
