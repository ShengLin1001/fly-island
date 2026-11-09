//! Clipboard history: commands, item types and the background capture service.

mod clipboard_io;
mod hotkey;
mod listener;
mod plugin_view;
mod popup;
mod service;
mod store;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

use listener::{notify_clipboard_changed, start_workers};
use store::{load_history, HISTORY_FILE_NAME, IMAGE_DIRECTORY_NAME};

pub(crate) use hotkey::parse_shortcut_binding;
pub(crate) use plugin_view::{plugin_history, plugin_item};
pub(crate) use popup::WINDOW_LABEL as POPUP_WINDOW_LABEL;

const HISTORY_CHANGED_EVENT: &str = "clipboard-history-changed";

const MAIN_WINDOW_LABEL: &str = "main";

const DEFAULT_MAX_ITEMS: usize = 30;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+W";

// The default before Ctrl+Shift+W. Saved settings still holding it move to the new
// default; it also took over Cut (Ctrl+X) in every other program.
const LEGACY_DEFAULT_SHORTCUT: &str = "Ctrl+X";

const MIN_MAX_ITEMS: usize = 5;

const MAX_MAX_ITEMS: usize = 200;

const SHORT_DUPLICATE_WINDOW_MS: i64 = 2_000;

const MAX_NOTE_CHARACTERS: usize = 80;

static CLIPBOARD_HISTORY: OnceLock<ClipboardHistoryService> = OnceLock::new();

/// Selection translation copies via Ctrl+C and then puts the clipboard back. Captures
/// that land before this instant are the temporary copy, not something the user copied.
static CAPTURE_SUSPENDED_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

pub(crate) fn suspend_clipboard_capture(duration: Duration) {
    let until = Instant::now() + duration;
    let Ok(mut slot) = CAPTURE_SUSPENDED_UNTIL.lock() else {
        return;
    };
    if slot.is_none_or(|current| current < until) {
        *slot = Some(until);
    }
}

pub(crate) fn clipboard_capture_suspended() -> bool {
    CAPTURE_SUSPENDED_UNTIL
        .lock()
        .ok()
        .and_then(|slot| *slot)
        .is_some_and(|until| Instant::now() < until)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistorySnapshot {
    settings: ClipboardHistorySettings,
    items: Vec<ClipboardHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistorySettings {
    enabled: bool,
    capture_images: bool,
    max_items: usize,
    #[serde(default = "default_clipboard_shortcut")]
    shortcut: String,
    #[serde(default = "default_true")]
    shortcut_enabled: bool,
    /// Where the shortcut opens the history (C22): its own window by default, or the island's page.
    #[serde(default)]
    open_in: OpenIn,
    /// Where the window appears: at the pointer or in the middle of the screen.
    #[serde(default)]
    popup_position: PopupPosition,
    /// Picking an entry in the window pastes it into the window that was in front.
    #[serde(default = "default_true")]
    auto_paste: bool,
    /// Pasting an image into a terminal pastes its file path, which Claude Code takes as an image.
    #[serde(default = "default_true")]
    terminal_image_path: bool,
    /// Entries older than this many days go, favourites aside; 0 keeps them until `max_items`.
    #[serde(default)]
    retention_days: u32,
    /// Skips what password managers mark as not for clipboard history.
    #[serde(default = "default_true")]
    skip_sensitive: bool,
    /// Win+V opens the history instead of Windows' own clipboard history (C22.3).
    #[serde(default)]
    win_v: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum OpenIn {
    #[default]
    Window,
    Island,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PopupPosition {
    #[default]
    Cursor,
    Center,
}

const MAX_RETENTION_DAYS: u32 = 365;

impl Default for ClipboardHistorySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            capture_images: true,
            max_items: DEFAULT_MAX_ITEMS,
            shortcut: default_clipboard_shortcut(),
            shortcut_enabled: true,
            open_in: OpenIn::Window,
            popup_position: PopupPosition::Cursor,
            auto_paste: true,
            terminal_image_path: true,
            retention_days: 0,
            skip_sensitive: true,
            win_v: false,
        }
    }
}

impl ClipboardHistorySettings {
    fn normalized(mut self) -> Self {
        self.max_items = self.max_items.clamp(MIN_MAX_ITEMS, MAX_MAX_ITEMS);
        self.retention_days = self.retention_days.min(MAX_RETENTION_DAYS);
        // The default parses to its own label (see hotkey tests), so falling back
        // to the constant matches falling back to its parsed binding.
        self.shortcut = parse_shortcut_binding(&self.shortcut)
            .filter(|binding| binding.label != LEGACY_DEFAULT_SHORTCUT)
            .map_or_else(default_clipboard_shortcut, |binding| binding.label);
        self
    }
}

/// How an item goes back on the clipboard (C22.1): as copied, or for an image the saved PNG as a
/// file (bitmap, PNG and CF_HDROP) or its quoted path as text. Text items always go as text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CopyAs {
    #[default]
    Original,
    File,
    Path,
}

#[derive(Clone)]
pub(crate) struct ShortcutBinding {
    pub(crate) label: String,
    pub(crate) modifiers: u32,
    pub(crate) key_code: u32,
}

fn default_true() -> bool {
    true
}

fn default_clipboard_shortcut() -> String {
    DEFAULT_SHORTCUT.to_string()
}

/// Always `Some`: the constant is a valid shortcut (checked by a hotkey test).
fn default_shortcut_binding() -> Option<ShortcutBinding> {
    parse_shortcut_binding(DEFAULT_SHORTCUT)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ClipboardHistoryItemKind {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryItem {
    id: String,
    kind: ClipboardHistoryItemKind,
    hash: String,
    created_at: i64,
    copied_at: i64,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    note: String,
    preview: String,
    text: Option<String>,
    image: Option<ClipboardHistoryImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryImage {
    width: usize,
    height: usize,
    byte_size: u64,
    original_path: String,
    thumbnail_path: String,
    thumbnail_data_url: Option<String>,
}

struct ClipboardHistoryState {
    settings: ClipboardHistorySettings,
    items: Vec<ClipboardHistoryItem>,
    last_capture_hash: Option<String>,
}

struct ClipboardHistoryService {
    app: AppHandle,
    history_path: PathBuf,
    image_dir: PathBuf,
    state: Mutex<ClipboardHistoryState>,
}

#[tauri::command]
pub fn get_clipboard_history() -> Result<ClipboardHistorySnapshot, String> {
    service()?.snapshot()
}

/// Why the clipboard shortcut could not be registered, or null when it is fine or off.
#[tauri::command]
pub fn get_clipboard_shortcut_error() -> Option<String> {
    hotkey::hotkey_error()
}

#[tauri::command]
pub fn set_clipboard_history_settings(
    settings: ClipboardHistorySettings,
) -> Result<ClipboardHistorySnapshot, String> {
    service()?.set_settings(settings)
}

#[tauri::command]
pub fn copy_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.copy_item(&id)
}

/// `copy_clipboard_history_item` with a choice of form for images (`file` or `path`).
#[tauri::command]
pub fn copy_clipboard_history_item_as(id: String, copy_as: CopyAs) -> Result<ClipboardHistorySnapshot, String> {
    service()?.copy_item_as(&id, copy_as)
}

/// From the clipboard window: puts the entry on the clipboard and pastes it into the window that
/// was in front (C22.2).
#[tauri::command]
pub async fn paste_clipboard_history_item(app: AppHandle, id: String) -> Result<(), String> {
    popup::paste(&app, &id)
}

#[tauri::command]
pub async fn hide_clipboard_popup(app: AppHandle) -> Result<(), String> {
    popup::hide(&app)
}

#[tauri::command]
pub fn toggle_clipboard_history_favorite(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.toggle_favorite(&id)
}

#[tauri::command]
pub fn set_clipboard_history_item_note(
    id: String,
    note: String,
) -> Result<ClipboardHistorySnapshot, String> {
    service()?.set_note(&id, &note)
}

#[tauri::command]
pub fn delete_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.delete_item(&id)
}

#[tauri::command]
pub fn clear_clipboard_history() -> Result<ClipboardHistorySnapshot, String> {
    service()?.clear()
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if CLIPBOARD_HISTORY.get().is_some() {
        return Ok(());
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let history_path = app_dir.join(HISTORY_FILE_NAME);
    let image_dir = app_dir.join(IMAGE_DIRECTORY_NAME);

    fs::create_dir_all(&image_dir)
        .map_err(|error| format!("Failed to create clipboard history directory: {error}"))?;

    let persisted = load_history(&history_path);
    let service = ClipboardHistoryService {
        app: app.clone(),
        history_path,
        image_dir,
        state: Mutex::new(ClipboardHistoryState {
            settings: persisted.settings.normalized(),
            items: persisted.items,
            last_capture_hash: None,
        }),
    };

    let _ = CLIPBOARD_HISTORY.set(service);
    start_workers();
    notify_clipboard_changed();
    Ok(())
}

fn service() -> Result<&'static ClipboardHistoryService, String> {
    CLIPBOARD_HISTORY
        .get()
        .ok_or_else(|| "Clipboard history service is not initialized.".to_string())
}

fn current_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::clipboard_history::get_clipboard_history,
            crate::clipboard_history::set_clipboard_history_settings,
            crate::clipboard_history::get_clipboard_shortcut_error,
            crate::clipboard_history::copy_clipboard_history_item,
            crate::clipboard_history::copy_clipboard_history_item_as,
            crate::clipboard_history::paste_clipboard_history_item,
            crate::clipboard_history::hide_clipboard_popup,
            crate::clipboard_history::toggle_clipboard_history_favorite,
            crate::clipboard_history::set_clipboard_history_item_note,
            crate::clipboard_history::delete_clipboard_history_item,
            crate::clipboard_history::clear_clipboard_history,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
