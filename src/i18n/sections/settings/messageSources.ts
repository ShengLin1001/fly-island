export type SettingsMessageSourcesText = {
  noticeTitle: string;
  noticeLabel: string;
  noticeLine: string;
  noticeBanner: string;
  noticeHint: string;
  qqTitle: string;
  qqHint: string;
  wechatTitle: string;
  wechatHint: string;
};

export const zhCN: SettingsMessageSourcesText = {
  noticeTitle: "新消息提示",
  noticeLabel: "提示方式",
  noticeLine: "一行预览",
  noticeBanner: "横幅",
  noticeHint: "横幅在收起的岛下方弹出一张卡片，写发送人、摘要和时间，几秒后收回，鼠标停在上面时不收。QQ、邮箱和插件通知用横幅；微信读不到内容，仍是一行提示。",
  qqTitle: "QQ 通知",
  qqHint: "通过 Windows 通知读取 QQ 消息的标题和预览，只保留在本次运行的内存中。需要 QQ 已登录并开启系统通知。",
  wechatTitle: "微信提醒",
  wechatHint: "只监听电脑版微信在任务栏的闪烁提醒，读取不到消息内容、发送人或未读数。需要微信保持登录。",
};

export const en: SettingsMessageSourcesText = {
  noticeTitle: "New messages",
  noticeLabel: "Show as",
  noticeLine: "One line",
  noticeBanner: "Banner",
  noticeHint: "A banner drops a card below the collapsed island with the sender, a summary and the time, and slides back after a few seconds unless the pointer rests on it. QQ, mail and plugin notifications use it; WeChat gives no message text, so it stays a single line.",
  qqTitle: "QQ notifications",
  qqHint: "Reads the title and preview of QQ messages from Windows notifications and keeps them in memory for this run only. QQ must be signed in with system notifications on.",
  wechatTitle: "WeChat reminders",
  wechatHint: "Only watches WeChat desktop flashing in the taskbar. Message text, senders and unread counts are not available. WeChat must stay signed in.",
};
