//! Where the cc-connect program is: the path set on the plugin page, else the running one, else
//! the first on PATH (`npm i -g cc-connect` puts a `cc-connect.cmd` there). No search of the
//! disks: that takes an index kept in memory (as Everything keeps), far too much for one file.

use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
};

pub(super) const EXE_NAME: &str = "cc-connect.exe";
/// Tried in each PATH folder in this order.
const PATH_NAMES: [&str; 2] = [EXE_NAME, "cc-connect.cmd"];

/// The program and how it was found ("setting", "running" or "path"); None when it is nowhere.
/// A path set on the plugin page that is not a file is an error rather than a reason to look
/// elsewhere, so a wrong setting is seen instead of quietly passed over.
pub(super) fn find(setting: Option<&str>) -> Result<Option<(PathBuf, &'static str)>, String> {
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
    Ok(env::var_os("PATH").and_then(|paths| on_path(&paths, Path::is_file)).map(|path| (path, "path")))
}

/// The first of PATH_NAMES in the folders of `paths`, as `is_file` says.
fn on_path(paths: &OsStr, is_file: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    env::split_paths(paths)
        .flat_map(|dir| PATH_NAMES.map(|name| dir.join(name)))
        .find(|path| is_file(path))
}

#[cfg(test)]
mod tests {
    use super::on_path;
    use std::{ffi::OsString, path::Path};

    #[test]
    fn the_first_folder_on_path_wins_and_an_exe_before_a_shim() {
        let paths = OsString::from(r"C:\a;C:\npm;C:\b");
        let have = |path: &Path| [r"C:\npm\cc-connect.cmd", r"C:\b\cc-connect.exe"].iter().any(|have| Path::new(have) == path);
        assert_eq!(on_path(&paths, have).as_deref(), Some(Path::new(r"C:\npm\cc-connect.cmd")));
        let both = |path: &Path| path.starts_with(r"C:\npm");
        assert_eq!(on_path(&paths, both).as_deref(), Some(Path::new(r"C:\npm\cc-connect.exe")));
        assert_eq!(on_path(&paths, |_| false), None);
    }
}
