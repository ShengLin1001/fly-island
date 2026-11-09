//! Export and import (C24.8): the history and snippets as one JSON file in Downloads, images
//! inside it as base64 PNG, so it can move to another computer. Importing adds what is not there
//! yet (by content hash) and never removes anything.

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

use super::{
    current_unix_millis, snippets::ClipboardSnippet, ClipboardHistoryItem, ClipboardHistoryItemKind,
    ClipboardHistoryService,
};

const APP: &str = "fly-island-clipboard";
const VERSION: u32 = 1;
/// A larger file is not read: the history holds at most 200 entries of 10 MB images.
const MAX_IMPORT_BYTES: usize = 512 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportedEntry {
    #[serde(flatten)]
    item: ClipboardHistoryItem,
    /// The image as base64 PNG; the paths in `item.image` are this computer's and are not used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image_png: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFile {
    app: String,
    version: u32,
    exported_at: i64,
    items: Vec<ExportedEntry>,
    #[serde(default)]
    snippets: Vec<ClipboardSnippet>,
}

/// What an import added.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    items: usize,
    snippets: usize,
}

/// `fly-island-clipboard-2026-11-09-1430.json`, with " (2)" and so on when it exists already.
fn free_path(dir: &std::path::Path, stamp: &str) -> PathBuf {
    let base = format!("{APP}-{stamp}");
    (1..)
        .map(|n| dir.join(if n == 1 { format!("{base}.json") } else { format!("{base} ({n}).json") }))
        .find(|path| !path.exists())
        .unwrap_or_else(|| dir.join(format!("{base}.json")))
}

impl ClipboardHistoryService {
    /// Writes the history and snippets to Downloads; returns the file's path.
    pub(super) fn export(&self) -> Result<String, String> {
        let (items, snippets) = {
            let state = self.state.lock().map_err(|error| error.to_string())?;
            (state.items.clone(), state.snippets.clone())
        };
        let items = items
            .into_iter()
            .map(|item| {
                let image_png = item
                    .image
                    .as_ref()
                    .and_then(|image| fs::read(&image.original_path).ok())
                    .map(|bytes| general_purpose::STANDARD.encode(bytes));
                ExportedEntry { item, image_png }
            })
            .collect();
        let file = ExportFile { app: APP.into(), version: VERSION, exported_at: current_unix_millis(), items, snippets };
        let content = serde_json::to_string(&file).map_err(|error| format!("Failed to write the export: {error}"))?;
        let dir = crate::win32::known_folder::downloads().ok_or("找不到下载文件夹。")?;
        let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M").to_string();
        let path = free_path(&dir, &stamp);
        fs::write(&path, content).map_err(|error| format!("Could not write {}: {error}", path.display()))?;
        Ok(path.to_string_lossy().into_owned())
    }

    /// Adds the entries and snippets of an exported file that are not here yet.
    pub(super) fn import(&self, content: &str) -> Result<ImportReport, String> {
        if content.len() > MAX_IMPORT_BYTES {
            return Err("The file is too large.".into());
        }
        let file: ExportFile = serde_json::from_str(content).map_err(|_| "这不是岛屿导出的剪贴板文件。".to_string())?;
        if file.app != APP || file.version > VERSION {
            return Err("这不是岛屿导出的剪贴板文件，或者来自更新的版本。".into());
        }
        let known: Vec<String> = self.state.lock().map_err(|error| error.to_string())?.items.iter().map(|item| item.hash.clone()).collect();
        let mut added = Vec::new();
        for ExportedEntry { mut item, image_png } in file.items {
            if known.contains(&item.hash) || added.iter().any(|kept: &ClipboardHistoryItem| kept.hash == item.hash) {
                continue;
            }
            if item.kind == ClipboardHistoryItemKind::Image {
                // Saved again under this computer's image folder.
                let Some(rgba) = image_png
                    .and_then(|png| general_purpose::STANDARD.decode(png).ok())
                    .and_then(|bytes| image::load_from_memory(&bytes).ok())
                    .map(|image| image.to_rgba8())
                else {
                    continue;
                };
                let (width, height) = (rgba.width() as usize, rgba.height() as usize);
                item.image = Some(self.persist_image(&item.hash, width, height, rgba.into_raw())?);
            }
            added.push(item);
        }

        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let items = added.len();
        state.items.extend(added);
        state.items.sort_by_key(|item| std::cmp::Reverse(item.copied_at));
        let mut snippets = 0;
        for snippet in file.snippets {
            if !state.snippets.iter().any(|kept| kept.text() == snippet.text()) {
                state.snippets.push(snippet);
                snippets += 1;
            }
        }
        self.enforce_limit_locked(&mut state);
        self.persist_locked(&state)?;
        drop(state);
        self.emit_changed();
        Ok(ImportReport { items, snippets })
    }
}

#[cfg(test)]
mod tests {
    use super::free_path;

    #[test]
    fn export_names_do_not_overwrite() {
        let dir = std::env::temp_dir().join(format!("fly-island-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let first = free_path(&dir, "2026-11-09-1430");
        assert!(first.ends_with("fly-island-clipboard-2026-11-09-1430.json"));
        std::fs::write(&first, "{}").expect("write");
        assert!(free_path(&dir, "2026-11-09-1430").ends_with("fly-island-clipboard-2026-11-09-1430 (2).json"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
