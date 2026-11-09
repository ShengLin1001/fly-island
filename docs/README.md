# 文档索引

按文档的性质分目录。同一个领域在不同目录里用同一个名字，例如功能说明 `features/file-shelf.md` 和界面约定 `design/file-shelf.md`。

| 目录 | 放什么 | 不放什么 |
|---|---|---|
| [features/](features/) | 功能说明：怎么用、怎么接入、怎么配置（面向用户和维护者） | 设计取舍、排查过程 |
| [architecture/](architecture/) | 整体架构和对外契约：[overview](architecture/overview.md)、[contracts](architecture/contracts.md)、[data-storage](architecture/data-storage.md)、[migration-map](architecture/migration-map.md) | 单个功能的说明 |
| [architecture/agent/](architecture/agent/) | AI Agent 状态、岛上交互、会话标题的方案 | |
| [architecture/plugins/](architecture/plugins/) | 插件平台的内部设计：[v1-design](architecture/plugins/v1-design.md)（第 1 版，P1–P4）、[v2-platform](architecture/plugins/v2-platform.md)（现行，P5 起）、[author-signing](architecture/plugins/author-signing.md) | 给插件作者看的文档（在 `plugins/`） |
| [architecture/history/](architecture/history/) | 已经做完的大计划，留作记录 | |
| [design/](design/) | 已确认的界面约定，按区域分文件（全局方向见 [DESIGN.md](../DESIGN.md)） | 还没定的方案 |
| [plugins/](plugins/) | 给插件作者的对外文档：入门、API、更新日志 | 岛屿内部实现 |
| [investigations/](investigations/) | 对**我们自己的应用**做的排查、技术验证、实测和验收 | 外部资料 |
| [research/](research/) | 对**外部**的调研：联网搜索、GitHub 项目、竞品和参考软件，规则见 [research/README.md](research/README.md) | 我们自己应用的实测 |
| [reviews/](reviews/) | PR 评审记录 | |
| [releases/](releases/) | 每个版本的发布说明 `vX.Y.Z.md`（release 脚本按这个名字读）；还没发的草稿用 `draft-` 开头 | |
| [tasks/](tasks/) | 任务，规则见 [tasks/README.md](tasks/README.md) | |
| [assets/](assets/) | 演示视频和图片 | |

新文档先按上表找目录；哪个都不合适时，先问用户，再在这张表里加一行。
