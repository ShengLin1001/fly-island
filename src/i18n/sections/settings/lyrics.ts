export type SettingsLyricsText = {
  title: string;
  hint: string;
  folder: string;
  folderHint: string;
  folderPlaceholder: string;
  online: string;
  onlineHint: string;
  chinese: string;
  chineseHint: string;
  offset: string;
  offsetHint: string;
  offsetValue: (ms: number) => string;
  offsetReset: string;
  onIsland: string;
  onIslandHint: string;
  onIslandNoSource: string;
  priority: string;
  priorityHint: string;
  priorityLyrics: string;
  priorityAgent: string;
  inflink: {
    title: string;
    hint: string;
    needsBetterNcm: string;
    getBetterNcm: string;
    install: string;
    update: string;
    installing: string;
    about: string;
    installed: (version: string) => string;
    updateAvailable: (installed: string, latest: string) => string;
    restart: (version: string) => string;
    failed: (error: string) => string;
  };
};

export const zhCN: SettingsLyricsText = {
  title: "歌词",
  hint: "找到带时间轴的歌词时，音乐页在波形上方显示滚动歌词。先找本地文件夹，再查在线歌词库。某首歌对不上时，可以在音乐页右上角单独调它的快慢。",
  folder: "本地歌词文件夹",
  folderHint: "放 .lrc 文件，文件名写成「歌手 - 歌名」「歌名 - 歌手」或「歌名」。只找这一层，不找子文件夹。",
  folderPlaceholder: "例如 D:\\Music\\Lyrics",
  online: "在线查找歌词",
  onlineHint: "本地找不到时查 LRCLIB（lrclib.net，免费开源的歌词库），会把歌名、歌手、专辑和时长发过去。每首歌只查一次，结果存在本机。中文歌收录较少。",
  chinese: "也查酷狗和网易云",
  chineseHint: "中文歌收录多，有翻译。这两个是非官方接口，可能随时失效；会把歌名、歌手和时长发给它们。装了网易云的 InfLink 插件时按歌曲直接查，更准。",
  offset: "歌词提前或推后",
  offsetHint: "歌词比歌声快就往右调，慢就往左调。",
  offsetValue: (ms) => (ms === 0 ? "0 秒" : `${ms > 0 ? "推后" : "提前"} ${Math.abs(ms) / 1000} 秒`),
  offsetReset: "恢复为 0",
  onIsland: "在收起的岛上显示当前歌词",
  onIslandHint: "播放中、找到带时间轴的歌词时，收起的岛显示正在唱的那一句；暂停、间奏和没找到歌词时照常显示待办。",
  onIslandNoSource: "还没有歌词来源：设置本地歌词文件夹，或打开「在线查找歌词」。",
  priority: "同时有 Agent 在运行时",
  priorityHint: "歌词优先：Agent 开始新会话、跑完或出错时临时显示 4 秒，做到一半等你审批或回答时一直显示到你处理；没找到歌词的歌显示「歌名 - 歌手」。Agent 优先：有 Agent 在运行就显示它，空下来才显示歌词。",
  priorityLyrics: "歌词优先",
  priorityAgent: "Agent 优先",
  inflink: {
    title: "网易云精确同步（InfLink-rs）",
    hint: "网易云插件，让网易云把播放进度和歌曲 ID 告诉系统：音乐页有进度条，歌词按歌曲直接查、不会对不上。从 GitHub 下载，放进 BetterNCM 的插件文件夹。",
    needsBetterNcm: "要先装 BetterNCM（网易云的第三方插件管理器）：它会往网易云的程序文件夹里放一个文件，所以由你自己安装，岛屿不改网易云。装好并打开一次网易云后，回到这里一键安装 InfLink-rs。",
    getBetterNcm: "获取 BetterNCM",
    install: "安装",
    update: "更新",
    installing: "正在安装…",
    about: "项目主页",
    installed: (version) => `已安装 v${version}。`,
    updateAvailable: (installed, latest) => `已安装 v${installed}，有新版本 v${latest}。`,
    restart: (version) => `已安装 v${version}，重启网易云后生效。`,
    failed: (error) => `安装失败：${error}`,
  },
};

export const en: SettingsLyricsText = {
  title: "Lyrics",
  hint: "When synced lyrics are found, the music page scrolls them above the waveform. Your folder is searched first, then the online lyrics library. A song that runs out of step can be moved on its own at the music page's top right.",
  folder: "Lyrics folder",
  folderHint: "Holds .lrc files named \"Artist - Title\", \"Title - Artist\" or \"Title\". Subfolders are not searched.",
  folderPlaceholder: "For example D:\\Music\\Lyrics",
  online: "Find lyrics online",
  onlineHint: "When the folder has none, asks LRCLIB (lrclib.net, a free and open lyrics library), sending the title, artist, album and length. Each song is asked about once and the answer is kept on this computer.",
  chinese: "Also ask Kugou and NetEase",
  chineseHint: "Many more Chinese songs, with translations. These are unofficial interfaces that may stop working at any time; the title, artist and length are sent to them. With NetEase's InfLink plugin the song is looked up by its id, which is more exact.",
  offset: "Lyrics earlier or later",
  offsetHint: "Move right if the lyrics run ahead of the singing, left if they lag.",
  offsetValue: (ms) => (ms === 0 ? "0 s" : `${Math.abs(ms) / 1000} s ${ms > 0 ? "later" : "earlier"}`),
  offsetReset: "Reset to 0",
  onIsland: "Show the current line on the collapsed island",
  onIslandHint: "While a song plays and synced lyrics are found, the collapsed island shows the line being sung; paused, between verses or without lyrics it shows your todo as usual.",
  onIslandNoSource: "No lyrics source yet: set a lyrics folder or turn on Find lyrics online.",
  priority: "While an agent is running",
  priorityHint: "Lyrics first: an agent shows for 4 seconds when it starts a session, finishes or fails, and stays while it is stopped on an approval or question; a song without lyrics shows “title - artist”. Agent first: a running agent shows, and lyrics come back when it is idle.",
  priorityLyrics: "Lyrics first",
  priorityAgent: "Agent first",
  inflink: {
    title: "Exact NetEase sync (InfLink-rs)",
    hint: "A NetEase Cloud Music plugin that tells Windows the playback position and song id: the music page gets a progress bar, and lyrics are looked up by song and stay in step. Downloaded from GitHub into BetterNCM's plugins folder.",
    needsBetterNcm: "Needs BetterNCM first (a third-party plugin manager for NetEase). It puts a file in NetEase's program folder, so you install it yourself; the island does not change NetEase. Once it is installed and NetEase has been opened once, install InfLink-rs here.",
    getBetterNcm: "Get BetterNCM",
    install: "Install",
    update: "Update",
    installing: "Installing…",
    about: "Project page",
    installed: (version) => `v${version} is installed.`,
    updateAvailable: (installed, latest) => `v${installed} is installed; v${latest} is out.`,
    restart: (version) => `v${version} is installed. Restart NetEase Cloud Music to use it.`,
    failed: (error) => `Install failed: ${error}`,
  },
};
