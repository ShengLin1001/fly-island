import { clamp } from "../../utils/number.ts";
import type { ClipboardHistorySettings, ClipboardHistorySnapshot } from "./api";
import { DEFAULT_CLIPBOARD_SHORTCUT, normalizeClipboardShortcut } from "./shortcut.ts";

export const DEFAULT_CLIPBOARD_HISTORY: ClipboardHistorySnapshot = {
  settings: {
    enabled: true,
    captureImages: true,
    maxItems: 30,
    shortcut: DEFAULT_CLIPBOARD_SHORTCUT,
    shortcutEnabled: true,
    openIn: "window",
    popupPosition: "cursor",
    autoPaste: true,
    terminalImagePath: true,
    retentionDays: 0,
    skipSensitive: true,
    winV: false,
    secrets: "mask",
    excludedApps: [],
    captureFiles: true,
    captureHtml: true,
    ocr: true,
  },
  items: [],
};

/** Choices for automatic clean-up, in days; 0 keeps entries until the count limit. */
export const CLIPBOARD_RETENTION_DAYS = [0, 1, 7, 30, 90] as const;

/** Program names as typed ("KeePass.exe, 1Password"): lower case, ".exe" added, no blanks. */
export function parseExcludedApps(text: string): string[] {
  return text
    .split(/[,，;\n]/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => (name.endsWith(".exe") ? name : `${name}.exe`));
}

export function normalizeClipboardSettings(
  settings: ClipboardHistorySettings,
): ClipboardHistorySettings {
  return {
    ...settings,
    maxItems: clamp(Math.round(settings.maxItems), 5, 200),
    shortcut: normalizeClipboardShortcut(settings.shortcut),
    shortcutEnabled: settings.shortcutEnabled !== false,
    openIn: settings.openIn === "island" ? "island" : "window",
    popupPosition: settings.popupPosition === "center" ? "center" : "cursor",
    autoPaste: settings.autoPaste !== false,
    terminalImagePath: settings.terminalImagePath !== false,
    retentionDays: clamp(Math.round(settings.retentionDays || 0), 0, 365),
    skipSensitive: settings.skipSensitive !== false,
    winV: settings.winV === true,
    secrets: settings.secrets === "skip" || settings.secrets === "keep" ? settings.secrets : "mask",
    excludedApps: Array.isArray(settings.excludedApps) ? settings.excludedApps.filter((name) => typeof name === "string") : [],
    captureFiles: settings.captureFiles !== false,
    captureHtml: settings.captureHtml !== false,
    ocr: settings.ocr !== false,
  };
}
