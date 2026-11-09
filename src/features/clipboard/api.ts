import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// 与 src-tauri/src/clipboard_history/mod.rs 中的同名结构对应。
export type ClipboardHistorySettings = {
  enabled: boolean;
  captureImages: boolean;
  maxItems: number;
  shortcut: string;
  shortcutEnabled: boolean;
  /** Where the shortcut opens the history (C22): its own window, or the island's page. */
  openIn: ClipboardOpenIn;
  popupPosition: ClipboardPopupPosition;
  /** Picking an entry in the window pastes it into the window that was in front. */
  autoPaste: boolean;
  /** An image pasted into a terminal goes as its file path (Claude Code takes it as an image). */
  terminalImagePath: boolean;
  /** Entries older than this many days go, favourites aside; 0 keeps them. */
  retentionDays: number;
  /** Skips what password managers mark as not for clipboard history. */
  skipSensitive: boolean;
  /** Win+V opens the history instead of Windows' own (C22.3). */
  winV: boolean;
  /** Text that looks like a key or token (C24.1). */
  secrets: ClipboardSecretHandling;
  /** Lower-case executable names whose copies are not recorded (C24.2). */
  excludedApps: string[];
  captureFiles: boolean;
  captureHtml: boolean;
  /** Reads the text in images with Windows' OCR (C24.9). */
  ocr: boolean;
};

export type ClipboardSecretHandling = "mask" | "skip" | "keep";

/** The program an entry was copied from (C24.2). */
export type ClipboardSource = { path: string; name: string };

export type ClipboardOpenIn = "window" | "island";
export type ClipboardPopupPosition = "cursor" | "center";

export type ClipboardHistoryImage = {
  width: number;
  height: number;
  byteSize: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailDataUrl?: string;
};

export type ClipboardHistoryItem = {
  id: string;
  kind: "text" | "image" | "files";
  hash: string;
  createdAt: number;
  copiedAt: number;
  favorite?: boolean;
  note?: string;
  preview: string;
  text?: string;
  image?: ClipboardHistoryImage;
  /** The text as HTML, pasted with its formatting (C24.4). */
  html?: string;
  /** A files entry's paths (C24.3). */
  files?: string[];
  source?: ClipboardSource;
  tags?: string[];
  /** Text Windows' OCR read in the image (C24.9). */
  ocrText?: string;
  /** Looks like a key: the preview is masked (C24.1). */
  masked?: boolean;
};

export type ClipboardHistorySnapshot = {
  settings: ClipboardHistorySettings;
  items: ClipboardHistoryItem[];
  /** Saved texts for pasting again (C24.6); missing before. */
  snippets?: ClipboardSnippet[];
};

/** A saved text; {date}, {time}, {datetime}, {weekday} and {clipboard} are filled in on paste. */
export type ClipboardSnippet = { id: string; title: string; text: string };

// 与 clipboard_history/mod.rs 中的 HISTORY_CHANGED_EVENT、clipboard_history/hotkey.rs 中的 HOTKEY_EVENT 一致。
export const CLIPBOARD_HISTORY_CHANGED_EVENT = "clipboard-history-changed";
export const CLIPBOARD_HISTORY_SHORTCUT_EVENT = "clipboard-history-shortcut";
// 与 clipboard_history/hotkey.rs 中的 HOTKEY_STATUS_EVENT 一致；载荷为注册错误，成功或关闭时为 null。
export const CLIPBOARD_SHORTCUT_STATUS_EVENT = "clipboard-history-shortcut-status";

export function getClipboardHistory() {
  return invoke<ClipboardHistorySnapshot>("get_clipboard_history");
}

export function getClipboardShortcutError() {
  return invoke<string | null>("get_clipboard_shortcut_error");
}

export function setClipboardHistorySettings(settings: ClipboardHistorySettings) {
  return invoke<ClipboardHistorySnapshot>("set_clipboard_history_settings", { settings });
}

/** How an image goes back (C22.1): as copied, as its saved file, or as its quoted path (for terminals). */
export type ClipboardCopyAs = "original" | "file" | "path" | "plain" | "text";

// copy_clipboard_history_item_as in src-tauri/src/clipboard_history/mod.rs (CopyAs).
export function copyClipboardItem(id: string, copyAs: ClipboardCopyAs = "original") {
  return copyAs === "original"
    ? invoke<ClipboardHistorySnapshot>("copy_clipboard_history_item", { id })
    : invoke<ClipboardHistorySnapshot>("copy_clipboard_history_item_as", { id, copyAs });
}

// The clipboard window (C22.2), src-tauri/src/clipboard_history/popup.rs.
const CLIPBOARD_POPUP_OPENED_EVENT = "clipboard-popup-opened";

/** Copies the entry, closes the window and pastes into the window that was in front. */
export function pasteClipboardItem(id: string, plain = false) {
  return invoke<void>("paste_clipboard_history_item", { id, plain });
}

/** A program's icon as a PNG data URL (get_agent_host_icon in agent_status), null without one. */
export function getAppIcon(path: string) {
  return invoke<string | null>("get_agent_host_icon", { path });
}

export function saveClipboardSnippet(id: string | null, title: string, text: string) {
  return invoke<ClipboardHistorySnapshot>("save_clipboard_snippet", { id, title, text });
}

export function deleteClipboardSnippet(id: string) {
  return invoke<ClipboardHistorySnapshot>("delete_clipboard_snippet", { id });
}

export function pasteClipboardSnippet(id: string) {
  return invoke<void>("paste_clipboard_snippet", { id });
}

/** Pastes the first entry now; each Ctrl+V after it pastes the next one (C24.7). */
export function pasteClipboardSequence(ids: string[]) {
  return invoke<void>("paste_clipboard_sequence", { ids });
}

/** Writes the history and snippets to Downloads; resolves to the file's path (C24.8). */
export function exportClipboardHistory() {
  return invoke<string>("export_clipboard_history");
}

/** Adds what an exported file holds; resolves to how many entries and snippets were new. */
export function importClipboardHistory(content: string) {
  return invoke<{ items: number; snippets: number }>("import_clipboard_history", { content });
}

export function revealExportedFile(path: string) {
  return revealItemInDir(path);
}

export function hideClipboardPopup() {
  return invoke<void>("hide_clipboard_popup");
}

/** The window was just shown by the shortcut; resolves to the unlisten function. */
export function listenClipboardPopupOpened(handler: () => void) {
  return listen(CLIPBOARD_POPUP_OPENED_EVENT, () => handler());
}

/** The window lost the focus (the user clicked elsewhere); resolves to the unlisten function. */
export function listenClipboardPopupBlur(handler: () => void) {
  return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused) handler();
  });
}

export function toggleClipboardFavorite(id: string) {
  return invoke<ClipboardHistorySnapshot>("toggle_clipboard_history_favorite", { id });
}

export function setClipboardItemNote(id: string, note: string) {
  return invoke<ClipboardHistorySnapshot>("set_clipboard_history_item_note", { id, note });
}

export function deleteClipboardItem(id: string) {
  return invoke<ClipboardHistorySnapshot>("delete_clipboard_history_item", { id });
}

export function clearClipboardHistory() {
  return invoke<ClipboardHistorySnapshot>("clear_clipboard_history");
}

/** 返回取消订阅函数的 Promise；调用方负责在卸载时取消。 */
export function listenClipboardHistoryChanged(handler: () => void) {
  return listen(CLIPBOARD_HISTORY_CHANGED_EVENT, handler);
}

export function listenClipboardHistoryShortcut(handler: () => void) {
  return listen(CLIPBOARD_HISTORY_SHORTCUT_EVENT, handler);
}

export function listenClipboardShortcutStatus(handler: (error: string | null) => void) {
  return listen<string | null>(CLIPBOARD_SHORTCUT_STATUS_EVENT, (event) => handler(event.payload));
}
