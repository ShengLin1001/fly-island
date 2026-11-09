export type SettingsTodoText = {
  title: string;
  carryOverIncomplete: string;
  enableReorder: string;
  rotateTodos: string;
  rotationSeconds: string;
  style: string;
  styleHint: string;
  stylePaper: string;
  styleIsland: string;
};

export const zhCN: SettingsTodoText = {
  title: "任务",
  carryOverIncomplete: "自动将未完成任务写入下一天",
  enableReorder: "允许拖动调整任务顺序",
  rotateTodos: "多任务流动",
  rotationSeconds: "每个任务停留时间（秒）",
  style: "显示风格",
  styleHint: "纸张：横线笔记本。岛屿：和岛上其他页面一样的深色列表，文字颜色跟着岛屿底色走。「待办纸张颜色」只对纸张生效。",
  stylePaper: "纸张",
  styleIsland: "岛屿",
};

export const en: SettingsTodoText = {
  title: "Tasks",
  carryOverIncomplete: "Carry unfinished tasks to next day",
  enableReorder: "Drag to reorder tasks",
  rotateTodos: "Rotate through pending tasks",
  rotationSeconds: "Time per task (seconds)",
  style: "Style",
  styleHint: "Paper: a ruled notebook. Island: a list drawn like the island's other pages, its text following the island's colour. The todo paper colour only applies to Paper.",
  stylePaper: "Paper",
  styleIsland: "Island",
};
