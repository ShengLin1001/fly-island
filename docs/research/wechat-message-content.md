# 微信消息的联系人和内容能不能上岛

> 日期：2026-11-09。问题：岛上的微信提醒能不能像 QQ 一样显示发件人和消息内容，微信有没有可用的接口。范围：用户分享的一段 ChatGPT 对话；GitHub 搜 `wechat-message-notifier`、`wechat-toast`、`WeChatNotifier`，读了前两个的 README。相关任务：[C13](/docs/tasks/C/C13.md)

## 结论

- **没有官方接口**能订阅个人微信的聊天消息（ChatGPT 的说法，与我们 2026-10 的调查一致）。它提到腾讯 2026 年的「ClawBot / iLink」Bot 接口：未核实，而且只管发给 Bot 的消息，与我们无关。
- **可行的路线是 UI Automation 读微信主窗口的会话列表**，能拿到会话名、消息摘要和未读状态。几个开源项目在微信 4.x 上这样做（见下表）。
- **关键未知：微信关到托盘时还能不能读到。** `wechat-toast` 明确写了只有微信主界面在前台可见时才稳定；`wechat-message-notifier` 没说，只提到「未找到会话列表时降到 5 秒扫一次」。我们 2026-10-19 在微信最小化时只读到 3 个窗口外壳控件、0 条文字（[wechat-reminders.md](/docs/features/wechat-reminders.md)「微信正文只读探测」）。先按 C13 实测四种窗口状态再决定。
- **要做的话**：保留任务栏闪动作为触发，闪了以后读一次会话列表，读不到就退回现在的「微信有新提醒」；不照外部项目每 1–2 秒轮询。读聊天摘要改变了现有的隐私说法，做成单独开关、默认关闭。

## 详细

| 项目 | 语言 / 许可 | 做法 | 已知限制 |
|---|---|---|---|
| [zddiao-max/wechat-message-notifier](https://github.com/zddiao-max/wechat-message-notifier) | C#，MIT；★5，2026-11-03 更新，版本 3.1.0 | 只读 UIA 读会话列表（联系人、摘要、未读），连上后约 1.5 秒扫一次，找不到会话列表时 5 秒；按会话、关键词筛选群聊、公众号、服务号；配置里只存联系人的哈希 | README 没写托盘状态下是否可用 |
| [EthanAIDev/wechat-toast](https://github.com/EthanAIDev/wechat-toast) | Python；★6，2026-10-27 更新 | UIA 检测未读会话，弹浮层或系统通知；基于 fenqijun/wechat-notifier | README：只有微信主界面在前台可见时才能稳定生效 |
| [CHENkai8385/WeChatNotifier](https://github.com/CHENkai8385/WeChatNotifier) | Python；★7 | ChatGPT 称它读微信本地会话元数据；未细看 | 依赖微信本地数据格式，我们不读数据库 |

（星数和更新时间为 2026-11-09 查询。）

UIA 路线共同的限制（ChatGPT 的对话和项目说明都提到）：

- 群聊的会话名是群名，拿不到具体发送人；
- 摘要会被微信截断，图片、语音只有类型提示；
- 微信升级后控件结构可能变化，要按版本重新验证。

## 来源

- 用户分享的 ChatGPT 对话「微信消息接口实现」（2026-11-09 读取）
- 上表三个仓库的 README
- [Microsoft：UI Automation Clients Overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-clientsoverview)
