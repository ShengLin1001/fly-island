export type WechatText = {
  desktopOnly: string;
  receive: string;
  pause: string;
  open: string;
  noReminders: string;
  exposeUi: string;
  exposeUiDescription: string;
  status: {
    disabled: string;
    waiting: string;
    listening: string;
    error: string;
  };
};

export const zhCN: WechatText = {
  desktopOnly: "请在 Windows 桌面版中使用微信提醒。",
  receive: "接收微信提醒",
  pause: "暂停微信提醒",
  open: "打开微信",
  noReminders: "暂无提醒",
  exposeUi: "显示联系人和消息摘要",
  exposeUiDescription: "把正在运行的微信里控制辅助功能的一个字节从 0 改成 1，微信就像开着读屏软件一样公开界面，提醒卡片能显示联系人和摘要，点卡片进入那个聊天。只改内存，微信重启后自动再改，关掉时改回。这是微信没有公开支持的做法，会多占一些 CPU 和内存，腾讯可能视为异常行为。微信关在托盘里时读不到，最小化可以。",
  status: {
    disabled: "已暂停",
    waiting: "连接中",
    listening: "已连接",
    error: "连接失败，正在重试",
  },
};

export const en: WechatText = {
  desktopOnly: "Use the Windows desktop app for WeChat reminders.",
  receive: "Receive WeChat reminders",
  pause: "Pause WeChat reminders",
  open: "Open WeChat",
  noReminders: "No reminders",
  exposeUi: "Show the contact and message",
  exposeUiDescription: "Sets one accessibility byte inside the running WeChat from 0 to 1, so WeChat exposes its interface as it would to a screen reader: reminder cards then show the contact and message and open that chat. Memory only; done again after WeChat restarts and undone when turned off. WeChat does not support this, it costs WeChat some CPU and memory, and Tencent may treat it as unusual behaviour. Nothing can be read while WeChat is closed to the tray; minimized works.",
  status: {
    disabled: "Paused",
    waiting: "Connecting",
    listening: "Connected",
    error: "Connection failed, retrying",
  },
};
