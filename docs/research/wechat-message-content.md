# 微信消息的联系人和内容能不能上岛

> 日期：2026-11-09。问题：岛上的微信提醒能不能像 QQ 一样显示发件人和消息内容，微信有没有可用的接口。范围：用户分享的一段 ChatGPT 对话；本机微信 4.1.15.56 的只读实测；GitHub 上读微信消息的项目（UI Automation、Hook、数据库、手机转发四类，读了 README 和相关 issue）。相关任务：[C13](/docs/tasks/0-archive/C/C13.md)（不做）

## 结论

**不做。** 电脑版微信 4.x 没有一条干净、可靠、普通用户能用的路能拿到联系人和消息内容。岛上的微信提醒维持现状：任务栏闪动时显示「微信有新提醒」，点击打开微信（[wechat-reminders.md](/docs/features/wechat-reminders.md)）。原因见文末「为什么不做」。

## 现状

岛上的微信提醒靠任务栏闪动（`RegisterShellHookWindow` 的 `HSHELL_FLASH`），只知道「微信想引起注意」，不知道是谁、说了什么。QQ 能显示联系人和内容，是因为 QQ 发 Windows 系统通知，岛屿读的是系统通知；微信不发。

## 各条路线

### 1. 官方接口：没有

微信没有让第三方程序订阅个人聊天消息的公开接口。ChatGPT 的对话提到腾讯 2026 年的「ClawBot / iLink」Bot 接口，未核实，而且按它的说法只管发给 Bot 的消息，与普通聊天无关。

### 2. Windows 系统通知：微信不发

2026-10-19 在微信 4.1.9.35 上观察，系统通知里没有微信的聊天通知；微信「设置 → 通知」里也没有系统横幅的开关（[wechat-reminders.md](/docs/features/wechat-reminders.md)「为什么不使用 QQ 的通知来源」）。

### 3. UI Automation 读会话列表：被讲述人卡住

外部项目的做法是读微信主窗口左侧的会话列表（会话名、最后一条的摘要、未读数）。

**实测（2026-11-09，微信 4.1.15.56，Windows 11）**：用 `wechat_accessibility_probe` 只读探测主窗口，前台、被遮挡、最小化、关到托盘四种状态都只读到 3 个窗口外壳控件，`namedListItems` 和 `namedTextControls` 都是 0；改用 `FindAll(Descendants)`（外部 C# 项目的查法）也是 0。

**原因**：微信 4.x（Qt 界面）只在检测到屏幕阅读器时才交出控件树。pywechat 的 [issue #113](https://github.com/Hello-Mr-Crab/pywechat/issues/113)（微信 4.1）里，用户测出重新登录后看不到控件，打开 Windows「讲述人」等它读出聊天内容再关掉，Inspect 才能看到；维护者说常开讲述人的电脑之后不开也能看到，像是被微信记住了。我们在本机没有用讲述人复测。

| 项目 | ★（2026-11-09） | 支持的微信 | 备注 |
|---|---|---|---|
| [cluic/wxauto](https://github.com/cluic/wxauto) | 7446 | 只有 3.9.x | 不支持 4.x |
| [Hello-Mr-Crab/pywechat](https://github.com/Hello-Mr-Crab/pywechat)（4.1 用 pyweixin 模块） | 2096 | 3.9.12、4.1.6+ | 监听消息要打开对应的聊天窗口；讲述人的问题见上 |
| [zddiao-max/wechat-message-notifier](https://github.com/zddiao-max/wechat-message-notifier) | 5 | 4.x | C#，MIT；读会话列表，约 1.5 秒轮询；README 没写托盘状态 |
| [EthanAIDev/wechat-toast](https://github.com/EthanAIDev/wechat-toast) | 6 | 4.x | README：只有微信主界面在前台可见时才稳定 |

其他限制：群聊只能拿到群名，拿不到发送人；摘要被微信截断，图片、语音只有类型提示；微信升级后控件结构可能变。

### 4. 截图加文字识别（OCR）

只在微信窗口显示在屏幕上时可用，关到托盘就没有画面；要截取聊天画面，隐私代价比读控件还大。

### 5. 注入微信进程（Hook）

| 项目 | ★ | 现状 |
|---|---|---|
| [lich0821/WeChatFerry](https://github.com/lich0821/WeChatFerry) | 6804 | 已归档 |
| [ttttupup/wxhelper](https://github.com/ttttupup/wxhelper) | 3196 | 只支持 3.8–3.9 的几个版本，README 写明可能封号 |

每个微信版本要重新逆向，现在都不支持 4.1。

### 6. 解密本地数据库

| 项目 | ★ | 现状 |
|---|---|---|
| [xaoyaoo/PyWxDump](https://github.com/xaoyaoo/PyWxDump) | 9634 | 2025-10-20 删除代码，只剩「项目移除通知」 |
| [sjzar/chatlog](https://github.com/sjzar/chatlog) | 9177 | 同一天删除 |

要从微信进程内存里取数据库密钥。两个最大的项目同日删库，法律风险明确。

### 7. 从手机拿通知

手机微信的通知里有联系人和内容（群聊还有发送人）。两种转到电脑的办法：

- Windows「手机连接」（Phone Link）把手机通知弹成电脑的系统通知，岛屿可以按 QQ 的方式读；
- [pppscn/SmsForwarder](https://github.com/pppscn/SmsForwarder)（★28788，Android）把 App 通知转发到 Webhook，岛屿要另加一个接收接口。

限制：要配对手机、两边保持连通；电脑登录微信时手机微信默认不发通知，要用户在手机上打开，手机也会跟着响；SmsForwarder 只有 Android。这条路没有实测。

## 为什么不做

1. **没有干净的数据来源。** 微信不发系统通知，也没有官方接口；剩下的路要么读界面，要么破解客户端。
2. **唯一合规的电脑端路线对普通用户不可用。** UI Automation 在微信 4.x 上默认什么也读不到（本机实测四种窗口状态都是 0），要先开一次讲述人；每次重新登录可能都要再开。岛屿也可以自己设置系统的「屏幕阅读器在运行」标志，但这是全系统的开关，会让别的程序改变行为（关动画、走无障碍界面），不能为了一个提醒功能去改。
3. **就算读到了，也不比现在好多少。** 只有会话名和被截断的摘要，群聊不知道是谁发的；外部项目自己写明微信不在前台时不稳定；每次微信升级都可能失效，要跟着返工。而现在的任务栏闪动方案稳定、零配置。
4. **另外几条路违背项目的原则。** 注入和解密数据库违反微信的用户协议，有封号和法律风险（相关项目已经归档或删库）；截图识别要截取聊天画面。岛屿对微信的承诺一直是「不读数据库、不注入、不截图」，这些不改。
5. **手机转发不是岛屿该做的。** 它依赖用户的手机、配对和手机端设置，覆盖的人很少；愿意这样做的用户可以自己用「手机连接」看系统通知。以后真要做，应作为通用的「手机通知上岛」单独考虑，不算微信功能。

**什么情况下重新考虑**：微信电脑版开始发带内容的系统通知，或者推出官方的消息接口，或者 UI Automation 不再依赖屏幕阅读器。到时候按 QQ 的方式接入即可。
