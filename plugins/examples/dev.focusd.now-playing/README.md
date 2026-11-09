# 正在播放

运行命令时在岛上提示正在播放的歌曲；需要的话也可以在换歌时提示。

## 怎么用

- 运行命令「显示正在播放」，岛上提示一次歌名和歌手，旁边是正在播放的音乐软件的图标，右侧有上一首、暂停/播放、下一首按钮（在新消息「展开面板」里显示）。提示停留的时长在岛屿设置「消息」里调。
- 插件设置里打开「换歌时提示」（默认关闭），换歌时也提示。默认关闭是因为岛屿的音乐页和收起条已经显示正在播放的歌；开了「展开面板」或「横幅」新消息提示时，每首歌都会多一张消息卡片。

## 权限

- `island:notify`：在岛上显示提示。
- `media:read`：读取正在播放的媒体信息。这是敏感权限，第一次读取时岛上会先问你是否允许。「换歌时提示」关着时插件不订阅播放变化，所以要到第一次运行命令时才会问。

## 给插件作者

这个插件的源码也可以当例子看：敏感权限的使用前确认、订阅媒体变化事件、插件设置、岛上提示，以及提示的样式：`icon: "media"`（音乐软件的图标）和 `layout: "inline"`（不带卡片，能力 `notifyStyle`），以及 `controls: "media"`（岛屿画的播放按钮，能力 `notifyControls`）。

## English

Shows the playing song on the island when you run Show now playing, and on every track change once "Notify on track change" is on in the plugin's settings (off by default: the island's music page and collapsed bar already show the song). The message carries previous, play / pause and next buttons, which the island runs itself. Reading media is a sensitive permission, so the island asks you the first time.
