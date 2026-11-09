/** The todo page in the island style (Settings → Todos → Style). */
export type TodoIslandText = {
  tabsLabel: string;
  today: string;
  tomorrow: string;
  note: string;
  upcoming: string;
  archive: string;
  /** Open todos on the Today tab, for screen readers. */
  openCount: (count: number) => string;
  addPlaceholder: string;
  addPlaceholderFor: (date: string) => string;
  emptyTitle: string;
  emptyHint: string;
  notePlaceholder: string;
  /** The save button, by state. */
  save: { idle: string; saving: string; saved: string; needsPath: string; error: string };
  backToArchive: string;
  /** "3 of 5 done" on a saved day and in the archive list. */
  doneOf: (done: number, total: number) => string;
  noArchives: string;
  noArchiveTasks: string;
  inProgress: string;
};

export const zhCN: TodoIslandText = {
  tabsLabel: "待办页面",
  today: "今天",
  tomorrow: "明天",
  note: "笔记",
  upcoming: "已安排",
  archive: "归档",
  openCount: (count) => `${count} 个未完成`,
  addPlaceholder: "添加待办，回车保存",
  addPlaceholderFor: (date) => `添加 ${date} 的待办`,
  emptyTitle: "今天还很轻",
  emptyHint: "在上面输入一件事，回车添加",
  notePlaceholder: "写点今天的笔记…",
  save: {
    idle: "保存今天的清单为 Markdown",
    saving: "正在保存…",
    saved: "已保存",
    needsPath: "还没设置保存位置，点这里去设置",
    error: "保存失败，点这里重试",
  },
  backToArchive: "返回归档",
  doneOf: (done, total) => `完成 ${done}/${total}`,
  noArchives: "还没有保存过的清单",
  noArchiveTasks: "这天没有记下待办",
  inProgress: "进行中",
};

export const en: TodoIslandText = {
  tabsLabel: "Todo pages",
  today: "Today",
  tomorrow: "Tomorrow",
  note: "Note",
  upcoming: "Upcoming",
  archive: "Archive",
  openCount: (count) => `${count} open`,
  addPlaceholder: "Add a task, press Enter",
  addPlaceholderFor: (date) => `Add a task for ${date}`,
  emptyTitle: "A light day so far",
  emptyHint: "Type a task above and press Enter",
  notePlaceholder: "Notes for today…",
  save: {
    idle: "Save today's list as Markdown",
    saving: "Saving…",
    saved: "Saved",
    needsPath: "No save folder yet; click to set one",
    error: "Could not save; click to try again",
  },
  backToArchive: "Back to the archive",
  doneOf: (done, total) => `${done} of ${total} done`,
  noArchives: "No saved lists yet",
  noArchiveTasks: "No tasks were written down",
  inProgress: "In progress",
};
