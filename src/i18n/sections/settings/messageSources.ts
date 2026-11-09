export type SettingsMessageSourcesText = {
  noticeTitle: string;
  noticeLabel: string;
  noticeLine: string;
  noticeBanner: string;
  noticePanel: string;
  noticeHint: string;
  panelSeconds: string;
  panelSecondsValue: (seconds: number) => string;
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
  noticePanel: "展开面板",
  noticeHint: "横幅在收起的岛下方弹出一张卡片，写发送人、摘要和时间，几秒后收回，鼠标停在上面时不收，点它打开对应的程序；微信读不到内容，卡片只写「有新提醒」。展开面板让岛自己展开到消息页，只列这次到达的消息（含微信），到时间自己收起，在面板里点过就不再自动收起。",
  panelSeconds: "面板停留时间",
  panelSecondsValue: (seconds) => `${seconds} 秒`,
  qqTitle: "QQ 通知",
  qqHint: "通过 Windows 通知读取 QQ 消息的标题和预览，只保留在本次运行的内存中。需要 QQ 已登录并开启系统通知。",
  wechatTitle: "微信提醒",
  wechatHint: "监听电脑版微信在任务栏的闪烁提醒，需要微信保持登录。不打开下面的开关时，只知道有新提醒，不知道是谁、说了什么。",
};

export const en: SettingsMessageSourcesText = {
  noticeTitle: "New messages",
  noticeLabel: "Show as",
  noticeLine: "One line",
  noticeBanner: "Banner",
  noticePanel: "Open panel",
  noticeHint: "A banner drops a card below the collapsed island with the sender, a summary and the time, and slides back after a few seconds unless the pointer rests on it; clicking it opens the app. WeChat gives no message text, so its card only says there is a new reminder. Open panel opens the island on the Messages page with just the new messages (WeChat included) and closes it again in time, unless you click inside.",
  panelSeconds: "Panel stays for",
  panelSecondsValue: (seconds) => `${seconds} s`,
  qqTitle: "QQ notifications",
  qqHint: "Reads the title and preview of QQ messages from Windows notifications and keeps them in memory for this run only. QQ must be signed in with system notifications on.",
  wechatTitle: "WeChat reminders",
  wechatHint: "Watches WeChat desktop flashing in the taskbar; WeChat must stay signed in. Without the switch below it only knows that something came, not who or what.",
};
