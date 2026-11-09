// The made-up release that update-reminder.html announces, shared by the island
// part of that page and the settings window it shows (settings.html?update=1).
import type { DownloadEvent, UpdateInfo } from "../../src/features/updater/api";

export const DEMO_CURRENT_VERSION = "0.3.3";

export const DEMO_UPDATE: UpdateInfo = {
  version: "0.3.4",
  body: [
    "## 更新内容",
    "",
    "- **邮箱图标跟着邮箱走**：QQ 邮箱、网易、Gmail、Outlook 显示各自的 logo，其他邮箱用默认图标。",
    "- Agent 用量环支持 Codex、GLM 和 Kimi。",
    "- 修复：邮件里的链接点了打不开。",
    "",
    "## 安装包",
    "",
    "- FocuSD.Island_0.3.4_x64-setup.exe",
    "",
    "---",
    "",
    "## What's new",
    "",
    "- **Mail icons follow the mailbox**: QQ Mail, NetEase, Gmail and Outlook show their logos; other mailboxes the plain icon.",
    "- The Agent usage rings cover Codex, GLM and Kimi.",
    "- Fixed: links in a mail did nothing when clicked.",
  ].join("\n"),
};

/** Plays a 12 MB download over about three seconds, as updater_install reports one. */
export function playDemoDownload(channel: unknown): Promise<null> {
  const send = (event: DownloadEvent) => (channel as { onmessage?: (event: DownloadEvent) => void }).onmessage?.(event);
  const total = 12 * 1024 * 1024;
  const steps = 30;
  return new Promise((resolve) => {
    send({ event: "Started", data: { contentLength: total } });
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      send({ event: "Progress", data: { chunkLength: total / steps } });
      if (step < steps) return;
      clearInterval(timer);
      send({ event: "Finished" });
      resolve(null);
    }, 100);
  });
}
