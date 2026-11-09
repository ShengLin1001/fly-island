/** Appearance → Items on the collapsed bar (C12, issue #17). */
export type SettingsCollapsedItemsText = {
  title: string;
  hint: string;
  left: string;
  right: string;
  empty: string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  toLeft: (name: string) => string;
  toRight: (name: string) => string;
  show: string;
  reset: string;
  item: {
    statusLight: string;
    mail: string;
    update: string;
    deviceUse: string;
    shelf: string;
    music: string;
    sessionCount: string;
    usage: (agent: string) => string;
  };
};

export const zhCN: SettingsCollapsedItemsText = {
  title: "收起条上的项目",
  hint: "摘要文字左右两侧的图标。每项可以调顺序、换到另一侧或隐藏；没有内容时（比如没有新邮件）项目不显示，但位置保留。插件的状态项和用量环也在这里统一排列。消息预览、音量和设备提醒这类临时内容不在这里。",
  left: "左侧",
  right: "右侧",
  empty: "这一侧没有项目。",
  moveUp: (name) => `上移：${name}`,
  moveDown: (name) => `下移：${name}`,
  toLeft: (name) => `移到左侧：${name}`,
  toRight: (name) => `移到右侧：${name}`,
  show: "显示",
  reset: "恢复默认",
  item: {
    statusLight: "Agent 状态灯",
    mail: "新邮件提醒",
    update: "更新提醒",
    deviceUse: "摄像头 / 麦克风",
    shelf: "文件中转数量",
    music: "音乐",
    sessionCount: "会话数 / 会话环",
    usage: (agent) => `用量环 · ${agent}`,
  },
};

export const en: SettingsCollapsedItemsText = {
  title: "Items on the collapsed bar",
  hint: "The icons left and right of the summary. Reorder them, move them to the other side or hide them; an item with nothing to show (no new mail, say) stays out of sight but keeps its place. Plugin status items and usage rings are arranged here too. Passing content such as message previews, volume and device alerts is not.",
  left: "Left",
  right: "Right",
  empty: "Nothing on this side.",
  moveUp: (name) => `Move up: ${name}`,
  moveDown: (name) => `Move down: ${name}`,
  toLeft: (name) => `Move to the left: ${name}`,
  toRight: (name) => `Move to the right: ${name}`,
  show: "Show",
  reset: "Reset to default",
  item: {
    statusLight: "Agent status light",
    mail: "New mail",
    update: "Update available",
    deviceUse: "Camera / microphone",
    shelf: "File shelf count",
    music: "Music",
    sessionCount: "Session count / ring",
    usage: (agent) => `Usage ring · ${agent}`,
  },
};
