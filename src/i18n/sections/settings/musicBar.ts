/** Settings → Music → On the island: the collapsed bar's music wave. */
export type SettingsMusicBarText = {
  title: string;
  wave: string;
  waveHint: string;
};

export const zhCN: SettingsMusicBarText = {
  title: "岛屿",
  wave: "在收起的岛上显示音乐波形",
  waveHint: "收起的岛右侧跳动的竖条，点它打开音乐页。和 外观 → 收起条 里「音乐」的显示开关是同一个，位置也在那里调。",
};

export const en: SettingsMusicBarText = {
  title: "Island",
  wave: "Show the music wave on the collapsed island",
  waveHint: "The moving bars on the collapsed island, which open the music page. The same switch as Music under Appearance → Collapsed bar, where it can also be moved.",
};
