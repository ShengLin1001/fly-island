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
  ocr: string;
  ocrHint: string;
  captureFiles: string;
  captureFilesHint: string;
  captureHtml: string;
  captureHtmlHint: string;
  secrets: string;
  secretsHint: string;
  secretsOptions: Record<"mask" | "skip" | "keep", string>;
  excludedApps: string;
  excludedAppsHint: string;
  transfer: {
    title: string;
    export: string;
    exportHint: string;
    exportAction: string;
    import: string;
    importHint: string;
    importAction: string;
    exported: string;
    imported: (items: number, snippets: number) => string;
    failed: string;
    show: string;
  };
  snippets: {
    title: string;
    hintTitle: string;
    hint: string;
    add: string;
    adding: string;
    editing: string;
    edit: (title: string) => string;
    remove: (title: string) => string;
    titlePlaceholder: string;
    textPlaceholder: string;
    save: string;
    cancel: string;
  };
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
  ocr: "识别图片里的文字",
  ocrHint: "用 Windows 自带的文字识别在本机识别，不联网。识别出的文字可以搜索，也可以单独复制。",
  captureFiles: "记录复制的文件",
  captureFilesHint: "在资源管理器里复制的文件也进历史，粘贴回去仍是文件；贴到终端里是文件路径。",
  captureHtml: "保留格式",
  captureHtmlHint: "从网页、Word 复制的文字连同格式一起记下，粘贴时带格式；独立窗口里按 Shift+Enter 粘贴成纯文本。",
  secrets: "密钥和令牌",
  secretsHint: "看起来像 API Key、GitHub 令牌、私钥的内容：打码显示（粘贴时仍是原文）、不记录，或照常记录。",
  secretsOptions: { mask: "打码", skip: "不记录", keep: "照常" },
  excludedApps: "不记录这些程序复制的内容",
  excludedAppsHint: "填程序名，逗号分隔，比如 keepass.exe。每条记录旁边会显示它来自哪个程序。",
  transfer: {
    title: "导入导出",
    export: "导出剪贴板历史",
    exportHint: "历史记录（含图片）和常用片段写成一个 JSON 文件，放在「下载」文件夹。里面可能有你复制过的密码和私人内容，注意保管。",
    exportAction: "导出",
    import: "从文件导入",
    importHint: "导入另一台电脑导出的文件：只加入这里还没有的记录和片段，不删除任何东西。",
    importAction: "选择文件",
    exported: "已导出",
    imported: (items, snippets) => `导入了 ${items} 条记录、${snippets} 个片段`,
    failed: "没有成功",
    show: "在文件夹中显示",
  },
  snippets: {
    title: "常用片段",
    hintTitle: "在剪贴板窗口按 Tab 切到「片段」",
    hint: "粘贴时会填好这些变量：{date} 日期、{time} 时间、{datetime} 日期和时间、{weekday} 星期、{clipboard} 剪贴板里现在的文字。",
    add: "新建片段",
    adding: "新建片段",
    editing: "修改片段",
    edit: (title) => `修改「${title}」`,
    remove: (title) => `删除「${title}」`,
    titlePlaceholder: "名字（不填就用第一行）",
    textPlaceholder: "内容，比如：{date} 周报",
    save: "保存",
    cancel: "取消",
  },
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
  ocr: "Read the text in images",
  ocrHint: "Windows' own text recognition, on this computer, offline. The text can be searched and copied on its own.",
  captureFiles: "Record copied files",
  captureFilesHint: "Files copied in Explorer join the history and paste back as files; into a terminal they go as paths.",
  captureHtml: "Keep formatting",
  captureHtmlHint: "Text copied from web pages or Word keeps its formatting when pasted; Shift+Enter in the window pastes plain text.",
  secrets: "Keys and tokens",
  secretsHint: "What looks like an API key, GitHub token or private key: shown masked (pasted as it is), not recorded, or recorded as usual.",
  secretsOptions: { mask: "Mask", skip: "Skip", keep: "Keep" },
  excludedApps: "Do not record copies from these programs",
  excludedAppsHint: "Program names separated by commas, such as keepass.exe. Each entry shows the program it came from.",
  transfer: {
    title: "Import and export",
    export: "Export the clipboard history",
    exportHint: "The entries (with images) and snippets go into one JSON file in Downloads. It may hold passwords and private things you copied; keep it safe.",
    exportAction: "Export",
    import: "Import from a file",
    importHint: "A file exported on another computer: only entries and snippets not here yet are added, nothing is removed.",
    importAction: "Choose file",
    exported: "Exported",
    imported: (items, snippets) => `Imported ${items} ${items === 1 ? "entry" : "entries"} and ${snippets} ${snippets === 1 ? "snippet" : "snippets"}`,
    failed: "That did not work",
    show: "Show in folder",
  },
  snippets: {
    title: "Snippets",
    hintTitle: "Press Tab in the clipboard window for Snippets",
    hint: "When pasted, these are filled in: {date}, {time}, {datetime}, {weekday} and {clipboard} (the text on the clipboard now).",
    add: "New snippet",
    adding: "New snippet",
    editing: "Edit snippet",
    edit: (title) => `Edit "${title}"`,
    remove: (title) => `Delete "${title}"`,
    titlePlaceholder: "Name (the first line if empty)",
    textPlaceholder: "Text, such as: Weekly report {date}",
    save: "Save",
    cancel: "Cancel",
  },
};
