//! Where the cc-connect program is, the first found wins: the path set on the plugin page, the
//! running one, the first on PATH (`npm i -g cc-connect` puts a `cc-connect.cmd` there), the one
//! the island downloaded (`<app data>/cc-connect/<version>/`, install.rs), then a `cc-connect`
//! folder where installers put programs (Program Files and Program Files (x86) on C: and D:, and
//! `%LOCALAPPDATA%\Programs`): the exe in it, or in a version folder under it. No search of the
//! disks: that takes an index kept in memory (as Everything keeps), far too much for one file.

use std::{
    env,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

pub(super) const EXE_NAME: &str = "cc-connect.exe";
/// The folder cc-connect is looked for in under each place programs go, the island's data folder too.
pub(super) const FOLDER: &str = "cc-connect";
/// Tried in each PATH folder in this order.
const PATH_NAMES: [&str; 2] = [EXE_NAME, "cc-connect.cmd"];

/// The program and how it was found ("setting", "running", "path", "downloaded" or "installed");
/// None when it is nowhere. `app_dir`: the island's data folder. A path set on the plugin page
/// that is not a file is an error rather than a reason to look elsewhere, so a wrong setting is
/// seen instead of quietly passed over.
pub(super) fn find(setting: Option<&str>, app_dir: Option<&Path>) -> Result<Option<(PathBuf, &'static str)>, String> {
    if let Some(path) = setting.map(str::trim).filter(|path| !path.is_empty()) {
        let path = PathBuf::from(path.trim_matches('"'));
        return if path.is_file() {
            Ok(Some((path, "setting")))
        } else {
            Err(format!("找不到 cc-connect 程序：{}", path.display()))
        };
    }
    if let Some(path) = crate::win32::process::running_executable(&[EXE_NAME]) {
        return Ok(Some((PathBuf::from(path), "running")));
    }
    if let Some(path) = env::var_os("PATH").and_then(|paths| on_path(&paths, Path::is_file)) {
        return Ok(Some((path, "path")));
    }
    if let Some(path) = app_dir.and_then(|dir| in_folder(&dir.join(FOLDER))) {
        return Ok(Some((path, "downloaded")));
    }
    Ok(install_roots().iter().find_map(|root| in_folder(&root.join(FOLDER))).map(|path| (path, "installed")))
}

/// The first of PATH_NAMES in the folders of `paths`, as `is_file` says.
fn on_path(paths: &OsStr, is_file: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    env::split_paths(paths)
        .flat_map(|dir| PATH_NAMES.map(|name| dir.join(name)))
        .find(|path| is_file(path))
}

/// Where installers put programs: Program Files, 64- and 32-bit, on C: and D:, and the per-user one.
fn install_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["C:", "D:"]
        .iter()
        .flat_map(|drive| ["Program Files", "Program Files (x86)"].map(|dir| PathBuf::from(format!(r"{drive}\{dir}"))))
        .collect();
    roots.extend(env::var_os("LOCALAPPDATA").map(|local| PathBuf::from(local).join("Programs")));
    roots
}

/// `folder/cc-connect.exe`, else the newest `folder/<version>/cc-connect.exe`.
fn in_folder(folder: &Path) -> Option<PathBuf> {
    let direct = folder.join(EXE_NAME);
    if direct.is_file() {
        return Some(direct);
    }
    fs::read_dir(folder)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join(EXE_NAME))
        .filter_map(|exe| {
            let meta = exe.metadata().ok().filter(fs::Metadata::is_file)?;
            Some((meta.modified().ok()?, exe))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, exe)| exe)
}

#[cfg(test)]
mod tests {
    use super::{in_folder, install_roots, on_path, EXE_NAME};
    use std::{ffi::OsString, fs, path::Path, thread, time::Duration};

    #[test]
    fn the_first_folder_on_path_wins_and_an_exe_before_a_shim() {
        let paths = OsString::from(r"C:\a;C:\npm;C:\b");
        let have = |path: &Path| [r"C:\npm\cc-connect.cmd", r"C:\b\cc-connect.exe"].iter().any(|have| Path::new(have) == path);
        assert_eq!(on_path(&paths, have).as_deref(), Some(Path::new(r"C:\npm\cc-connect.cmd")));
        let both = |path: &Path| path.starts_with(r"C:\npm");
        assert_eq!(on_path(&paths, both).as_deref(), Some(Path::new(r"C:\npm\cc-connect.exe")));
        assert_eq!(on_path(&paths, |_| false), None);
    }

    #[test]
    fn installers_folders_on_c_and_d_both_bitnesses() {
        let roots = install_roots();
        for root in [r"C:\Program Files", r"C:\Program Files (x86)", r"D:\Program Files", r"D:\Program Files (x86)"] {
            assert!(roots.iter().any(|have| have == Path::new(root)), "{root}");
        }
    }

    #[test]
    fn the_exe_in_the_folder_else_the_newest_version_folder() {
        let folder = std::env::temp_dir().join(format!("focusd-cc-connect-locate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        assert_eq!(in_folder(&folder), None);
        for version in ["v1.4.0", "v1.5.0"] {
            fs::create_dir_all(folder.join(version)).unwrap();
            fs::write(folder.join(version).join(EXE_NAME), b"").unwrap();
            thread::sleep(Duration::from_millis(20));
        }
        fs::create_dir_all(folder.join("logs")).unwrap();
        assert_eq!(in_folder(&folder), Some(folder.join("v1.5.0").join(EXE_NAME)));
        fs::write(folder.join(EXE_NAME), b"").unwrap();
        assert_eq!(in_folder(&folder), Some(folder.join(EXE_NAME)));
        let _ = fs::remove_dir_all(&folder);
    }
}
