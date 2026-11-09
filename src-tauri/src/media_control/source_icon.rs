//! The icon of the app playing media, for a plugin notification that asks for it
//! (`island.notify` with `icon: "media"`).

use super::service;
use crate::agent_status::host_icon;
use crate::win32;

/// Executable names a media session's app id may stand for: a desktop app reports its exe name,
/// sometimes without ".exe"; a packaged app ("Publisher.App_hash!App") has no exe to read.
pub(super) fn executable_names(source_app: &str) -> Vec<String> {
    let name = source_app.rsplit(['\\', '/']).next().unwrap_or_default().trim();
    if name.is_empty() || name.contains('!') {
        return Vec::new();
    }
    if name.to_ascii_lowercase().ends_with(".exe") {
        vec![name.to_string()]
    } else {
        vec![format!("{name}.exe")]
    }
}

/// The playing app's icon as a PNG data URL, or `None` when nothing plays or its icon cannot be read.
pub(crate) fn current_source_icon() -> Option<String> {
    let source_app = service::get_state(None).ok()?.source_app?;
    let names = executable_names(&source_app);
    let names: Vec<&str> = names.iter().map(String::as_str).collect();
    let path = win32::process::running_executable(&names)?;
    host_icon::icon_data_url(&path)
}

#[cfg(test)]
mod tests {
    use super::executable_names;

    #[test]
    fn app_ids_map_to_executable_names() {
        assert_eq!(executable_names("cloudmusic.exe"), ["cloudmusic.exe"]);
        assert_eq!(executable_names("QQMusic"), ["QQMusic.exe"]);
        assert_eq!(executable_names(r"C:\Apps\Spotify.EXE"), ["Spotify.EXE"]);
        assert!(executable_names("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify").is_empty());
        assert!(executable_names("  ").is_empty());
    }
}
