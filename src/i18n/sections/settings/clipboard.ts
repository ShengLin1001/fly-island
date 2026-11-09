export type SettingsClipboardText = {
  title: string;
  captureImages: string;
  maxItems: string;
  visibleRows: string;
  shortcut: string;
  shortcutEnabled: string;
  pressKeys: string;
  openTitle: string;
  openIn: string;
  openInHint: string;
  openInOptions: Record<"window" | "island", string>;
  popupPosition: string;
  popupPositionOptions: Record<"cursor" | "center", string>;
  autoPaste: string;
  autoPasteHint: string;
  terminalImagePath: string;
  terminalImagePathHint: string;
  skipSensitive: string;
  skipSensitiveHint: string;
  retention: string;
  retentionHint: string;
  retentionOption: (days: number) => string;
  winV: string;
  winVHint: string;
};

export const zhCN: SettingsClipboardText = {
  title: "剪贴板历史",
  captureImages: "记录图片",
  maxItems: "最大历史条数",
  visibleRows: "展开后显示条数",
  shortcut: "展开快捷键",
  shortcutEnabled: "启用展开快捷键",
  pressKeys: "按下组合键",
  openTitle: "打开方式",
  openIn: "快捷键打开",
  openInHint: "独立窗口在鼠标旁弹出，选中一条直接粘贴到原来的窗口；岛上页面和以前一样，展开岛的剪贴板页。",
  openInOptions: { window: "独立窗口", island: "岛上页面" },
  popupPosition: "弹出位置",
  popupPositionOptions: { cursor: "鼠标旁", center: "屏幕中间" },
  autoPaste: "选中后自动粘贴",
  autoPasteHint: "关掉时只复制，回到原来的窗口自己按 Ctrl+V。",
  terminalImagePath: "粘贴图片到终端时贴文件路径",
  terminalImagePathHint: "Windows Terminal 等终端里粘贴图片时改贴它的文件路径，Claude Code 会把路径当成图片附上（直接粘贴位图常常贴不上）。",
  skipSensitive: "不记录密码",
  skipSensitiveHint: "密码管理器（KeePass、Bitwarden、1Password 等）复制的密码带着「不要记录」的标记，和系统剪贴板历史一样跳过它们。",
  retention: "自动清理",
  retentionHint: "超过这个时间没再复制过的记录自动删除，收藏的不删。",
  retentionOption: (days) => (days === 0 ? "不清理" : `${days} 天`),
  winV: "用 Win+V 打开",
  winVHint: "按 Win+V 打开岛屿的剪贴板，代替系统自带的剪贴板历史；关掉后 Win+V 还给系统。",
};

export const en: SettingsClipboardText = {
  title: "Clipboard history",
  captureImages: "Record images",
  maxItems: "Max entries",
  visibleRows: "Entries shown when open",
  shortcut: "Expand shortcut",
  shortcutEnabled: "Enable expand shortcut",
  pressKeys: "Press keys",
  openTitle: "Opening",
  openIn: "The shortcut opens",
  openInHint: "The window pops up by the pointer and pastes what you pick into the window you were in; the island page opens the island's clipboard page as before.",
  openInOptions: { window: "A window", island: "The island page" },
  popupPosition: "Where it appears",
  popupPositionOptions: { cursor: "By the pointer", center: "Screen centre" },
  autoPaste: "Paste what you pick",
  autoPasteHint: "Off: it is only copied, and you press Ctrl+V back in your window.",
  terminalImagePath: "Paste images into terminals as their path",
  terminalImagePathHint: "In Windows Terminal and other terminals an image is pasted as its file path, which Claude Code attaches as an image (pasting the bitmap often fails there).",
  skipSensitive: "Do not record passwords",
  skipSensitiveHint: "Password managers (KeePass, Bitwarden, 1Password...) mark the passwords they copy; like Windows' own clipboard history, these are skipped.",
  retention: "Clean up",
  retentionHint: "Entries not copied again for this long are deleted; favourites stay.",
  retentionOption: (days) => (days === 0 ? "Never" : days === 1 ? "1 day" : `${days} days`),
  winV: "Open with Win+V",
  winVHint: "Win+V opens the island's clipboard instead of Windows' own clipboard history; turned off, Win+V goes back to Windows.",
};
