# 开源剪贴板管理器调研

> 日期：2026-11-09。问题：我们已经有剪贴板历史页，参考开源剪贴板管理器，看还缺什么、哪些值得做；重点弄清三件事：怎么接管 Win+V、独立弹窗怎么粘贴回原窗口、历史图片怎么在 Claude Code 这类终端 CLI 里粘贴成功。范围：GitHub（`gh search repos "clipboard manager" --sort stars`，以及 `crosspaste`、`clipboard sync`、`剪贴板` 等关键词）、各项目源码（`gh search code` 搜 `DisabledHotkeys`、`WH_KEYBOARD_LL`、`ExcludeClipboardContentFromMonitorProcessing` 等）、anthropics/claude-code 的 issue、Microsoft Learn 和 Microsoft 支持文档。相关任务：暂无。
>
> star 数、最后推送时间、版本号都是 2026-11-09 用 `gh api` 查到的。

## 结论

### 我们现在有什么（对照基线）

读了 `src/features/clipboard/` 和 `src-tauri/src/clipboard_history/`：

- 记录**文本**和**图片**（`arboard` 读写；图片存为 PNG 加缩略图，单张 PNG 上限 10 MB），`AddClipboardFormatListener` 监听，失败时每 2 秒轮询。
- 历史条数 5～200，默认 30；超出时先删最旧的**非收藏**项。数据存在应用数据目录的 JSON 文件和 `clipboard-images/`。
- 收藏、备注（≤80 字）、搜索、「全部 / 收藏」切换、删除、清空。
- 全局快捷键（默认 `Ctrl+Shift+W`，`RegisterHotKey` 注册，可以录制、可以关闭），按下后展开岛屿的剪贴板页。
- 点一条 = **只写回剪贴板**，不自动粘贴到原来的窗口。
- 划词翻译期间暂停记录；插件可以通过 `clipboard:read` 权限读文本历史。

没有的：富文本（HTML/RTF）、文件、自动粘贴、独立弹窗、数字键快速粘贴、纯文本粘贴、忽略密码管理器的内容、来源应用、按时间清理、导入导出、同步、Win+V。

### 三个重点问题的答案

**1. 接管 Win+V**：Win+V 被 Explorer 用 `RegisterHotKey` 占着，我们直接注册 `Win+V` 会失败。开源项目有三种做法：

| 做法 | 谁在用 | 代价 |
|---|---|---|
| **低级键盘钩子** `WH_KEYBOARD_LL`：Win 按住时吞掉 V 的按下和抬起，再注入一次未分配的虚拟键 `0xE8`，阻止松开 Win 时弹出开始菜单 | EcoPaste 1.0.0 起（设置项「接管 Win+V」） | 不改注册表、不重启 Explorer，关掉开关就恢复；但钩子常驻，回调慢了会被系统摘掉，还有边界 bug（EcoPaste #1466：Win 不放、连按 V 第二次会漏给系统） |
| **注册表** `HKCU\...\Explorer\Advanced` 的 `DisabledHotkeys` 字符串里加 `V`，**重启 Explorer**，然后自己 `RegisterHotKey(MOD_WIN, 'V')` | QuickClipboard、TieZ（TieZ 还把系统剪贴板历史和云剪贴板一起关掉） | 要杀掉并重启 explorer.exe（任务栏闪一下，打开的资源管理器窗口全关）；卸载或关闭功能时必须把 `V` 删掉再重启一次，否则 Win+V 一直失效（TieZ 在 NSIS 卸载脚本里做了这件事） |
| 不做，让用户用 AutoHotkey / PowerToys 把 Win+V 改到别的键 | Ditto（维护者明确拒绝，#143、#783） | 无 |

**建议**：如果要做，走 EcoPaste 的钩子方案，做成默认关闭的开关；不要改注册表和重启 Explorer，那样对一个「悬浮岛」来说副作用太大，而且应用异常退出时恢复不了。

**2. 独立弹窗**：做得好的都是「**弹窗不抢焦点**」或「**记住原窗口、粘贴前还给它**」。EcoPaste 把剪贴板窗口设成不可聚焦（`set_focusable(false)`），可见期间用低级键盘钩子收方向键、回车、数字键，用鼠标钩子处理点外面关闭；原窗口一直保持焦点，粘贴时只需 `SendInput` 一次 Ctrl+V。Ditto 和 QuickClipboard 用的是另一种办法：弹出前记下前台窗口（Ditto 还用 `GetGUIThreadInfo` 记下具体的焦点控件），粘贴前 `AttachThreadInput` + `SetForegroundWindow` 还回去，等它真的回到前台再发按键。弹出位置一般三选一：跟随鼠标（EcoPaste 默认）、屏幕中央、记住上次。粘贴键用 **Ctrl+V** 而不是 Shift+Insert（EcoPaste 在代码注释里写了原因：Monaco 编辑器会把 Insert 当成切换改写模式）。Ditto 还能按目标程序配置不同的粘贴按键。

**3. 历史图片粘贴到 Claude Code CLI**：

- Claude Code 在 Windows 上用 **Alt+V** 粘贴图片（Windows Terminal 自己拦了 Ctrl+V）。实现方式是起 PowerShell 5.1，调 `System.Windows.Forms.Clipboard.ContainsImage()` / `GetImage()`（#100899 记录了具体命令）。所以剪贴板上要有 .NET 认得的 **Bitmap**（`CF_DIB` / `CF_DIBV5` 都行，系统会互相合成）。
- 我们写回图片用的 `arboard` 3.x 会同时放 **`PNG` 注册格式和 `CF_DIBV5`**，格式上已经够了。但 Claude Code 自己的读取路径有一串还没修好的 bug：明明有图却报「No image found in clipboard」、第一次失败第二次成功、几分钟后失效（#68021、#90657、#103062、#69234），每次要 1～2.6 秒（#100899）。这些不是我们能修的。
- **更可靠的绕法是给路径**：在 #68021 里，有人确认读取只在「原始位图」上失败，剪贴板里是**文件引用（`CF_HDROP`）**时一直正常；另外 Claude Code 会把粘贴文本里的图片路径当成图片附上（#105249、#105680 是用户抱怨这个行为，正好说明它可行）。我们的历史图片本来就以 PNG 文件存在应用数据目录里，路径稳定。
- **建议**：图片条目加一个「**复制为文件**」/「**粘贴为路径**」操作。前者参照 QuickClipboard 的 `set_clipboard_image_file`，一次写入 `CF_DIB` + `PNG` + `CF_HDROP`（贴到聊天软件、画图、终端都能用）；后者直接写入带引号的路径文本，在 Windows Terminal 里用普通 Ctrl+V 就能贴，Claude Code 会把它识别成图片。以后做自动粘贴时，如果目标进程是 `WindowsTerminal.exe` 且条目是图片，可以改发 Alt+V，或者改贴路径。

### 推荐做的事

见文末「[优先级建议](#优先级建议)」。前三项：**忽略密码管理器内容**（几十行，隐私上必须有）、**图片复制为文件 / 粘贴为路径**（直接解决 Claude Code 的痛点）、**选中后自动粘贴回原窗口 + 键盘导航 + 数字键**（剪贴板工具最核心的体验，我们现在没有）。

## 详细

### 一、项目概览

| 项目 | ★（2026-11-09） | 许可证 | 平台 | 技术栈 | 最近推送 | 说明 |
|---|---|---|---|---|---|---|
| [Maccy](https://github.com/p0deje/Maccy) | 22251 | MIT | macOS | Swift | 2026-10-26 | 键盘优先、极简；⌥+回车粘贴，⌥+⇧+回车纯文本粘贴，⌥+数字快速粘贴；可以「忽略下一次复制」 |
| [CopyQ](https://github.com/hluk/CopyQ) | 12619 | GPL-3.0 | Win / macOS / Linux | C++ / Qt | 2026-11-02（v17.0.0，2026-10-06） | 标签页、多格式、脚本 API 和命令行、按窗口或内容忽略、加密标签页（`itemencrypted` 插件，GPG） |
| [Clipy](https://github.com/Clipy/Clipy) | 8965 | MIT | macOS | Swift | 2026-11-09 | 历史加片段（snippets）菜单 |
| [EcoPaste](https://github.com/EcoPasteHub/EcoPaste) | 7572 | Apache-2.0 | Windows / macOS | **Tauri 2** + React 19，SQLite（sqlx）+ FTS5 | 2026-08-13（v1.1.0，2026-07-22） | 和我们技术栈最接近，详见下文 |
| [Ditto](https://github.com/sabrogden/Ditto) | 7443 | GPL-3.0 | Windows | C++ / MFC，SQLite | 2026-10-01（3.25.113.0，2025-09-27） | Windows 上的老牌；分组、查找即输入、局域网同步（带密码加密） |
| [Slackadays/Clipboard](https://github.com/Slackadays/Clipboard) | 5945 | GPL-3.0 | 终端 | C++ | 2026-05-06 | 命令行剪贴板，参考价值小 |
| [SyncClipboard](https://github.com/Jeric-X/SyncClipboard) | 5210 | MIT | Win / macOS / Linux / 手机 | C# | 2026-11-09 | 同步为主，支持 WebDAV / S3 / 自建服务器 |
| [TieZ](https://github.com/jimuzhe/tiez-clipboard) | 3099 | GPL-3.0 | Windows 等 | **Tauri 2** + Rust | 2026-10-23 | 标签、贴边隐藏、WebDAV / MQTT 同步、局域网传输、顺序粘贴、隐私打码 |
| [Flycut](https://github.com/TermiT/Flycut) | 2700 | MIT | macOS | Objective-C | 2026-08-07 | 面向开发者的极简历史（⇧⌘V） |
| [CrossPaste](https://github.com/CrossPaste/crosspaste-desktop) | 2693 | AGPL-3.0 | Win / macOS / Linux | Kotlin | 2026-11-09 | 局域网端到端加密同步、本地 OCR、MCP Server、CLI |
| [PasteBar](https://github.com/PasteBar/PasteBarApp) | 2195 | 自定义（NOASSERTION） | Windows / macOS | **Tauri** + React 19，Diesel | 2026-08-18 | 无限历史、收藏夹/标签页/看板、PIN 保护的收藏、表单和模板、备份恢复 |
| [QuickClipboard](https://github.com/mosheng1/QuickClipboard) | 2061 | Apache-2.0 | Windows（加 Android） | **Tauri 2** + React | 2026-10-14 | 数字键 1-9 粘贴、Win+V、分组、贴图、OCR、WebDAV、应用过滤、低内存模式 |
| [UniClipboard](https://github.com/UniClipboard/UniClipboard) | 1982 | AGPL-3.0 | Win / macOS / Linux | TypeScript | 2026-11-09 | P2P 加中继的加密同步、本地全文索引也加密 |
| [ClipCascade](https://github.com/Sathvik-Rao/ClipCascade) | 1966 | GPL-3.0 | Win / macOS / Linux / Android | Python（客户端）+ Java 服务端 | 2026-11-08 | 自建服务器或 P2P 同步、端到端加密、按设备选收发方向 |
| [Qopy](https://github.com/0PandaDEV/Qopy) | 407 | AGPL-3.0 | Win / macOS / Linux | Tauri + Vue | 2026-03-15 | 小型 Tauri 剪贴板管理器 |

闭源参考（只看设计）：Paste（macOS，横向卡片条、Pinboards）、Raycast 的剪贴板历史（搜索框加右侧大预览、按类型过滤），没有逐项核实。

**Windows 11 自带剪贴板历史（Win+V）是基线**（[Microsoft 支持](https://support.microsoft.com/en-us/windows/clipboard-in-windows-c436501e-985d-1c8d-97ea-fe46ddf338c6)）：最多 25 条，单条 4 MB 以内，只支持文本、HTML、位图；可以固定，固定的在重启和清空后保留；**每次重启清空未固定的条目**；可以通过微软账户跨设备同步。我们已经比它多了持久化、搜索、备注和 200 条上限，比它少的是 HTML、自动粘贴和同步。

### 二、接管 Win+V

**为什么不能直接注册**：Win+V 被系统 shell 用 `RegisterHotKey` 占着。Windhawk 的一个模组正是在 explorer.exe、TextInputHost.exe、ShellExperienceHost.exe 里拦截 `RegisterHotKey(MOD_WIN, 'V')`，让它失败，然后要求重启 Explorer、结束 TextInputHost.exe，这样别的程序才能注册 Win+V（[gist](https://gist.github.com/nielpattin/82122f86e8161d85f39703b7482b77cc)）。由此可以知道占用者是 shell 的那几个进程。我们的 `parse_shortcut_binding` 支持 Win 修饰键，但用户录 Win+V 会注册失败。

**做法 A：低级键盘钩子（EcoPaste）**。源码 `src-tauri/src/shortcut/win_v.rs`：

- 设置开关打开时起一个线程，`SetWindowsHookExW(WH_KEYBOARD_LL)` 后跑消息循环；关闭时 `PostThreadMessageW(WM_QUIT)` 退出并 `UnhookWindowsHookEx`。不碰注册表，也不重启任何进程。
- 回调里只看 V：`GetAsyncKeyState(VK_LWIN/VK_RWIN)` 判断 Win 是否按住；是就返回 1 吞掉，并用原子变量区分首次按下和自动重复，只切换一次窗口；**V 的抬起也配对吞掉**，避免前台程序收到一个孤立的 KEYUP。
- 吞键后 `SendInput` 注入一次虚拟键 `0xE8`（未分配，AutoHotkey 的 menu mask key 也用它）的按下和抬起，让 shell 认为 Win 按住期间有过别的输入，松开 Win 时就不会弹开始菜单。带 `LLKHF_INJECTED` 标记的事件直接放行。
- 窗口切换不在钩子线程里做，用 `run_on_main_thread` 回到主线程。
- 更新日志：1.0.0（2026-07-03）「Added a Windows Win+V toggle, so EcoPaste can replace the system clipboard panel」（[CHANGELOG](https://github.com/EcoPasteHub/EcoPaste/blob/master/CHANGELOG.md)，对应 [PR #1273](https://github.com/EcoPasteHub/EcoPaste/pull/1273) 关闭了 [#1092](https://github.com/EcoPasteHub/EcoPaste/issues/1092)）。
- 已知问题：[#1466](https://github.com/EcoPasteHub/EcoPaste/issues/1466)（2026-10-30，v1.1.0，Win11）：一直按住 Win，松开 V 再按，第二次会弹出系统面板，还没修。
- 通用风险（Microsoft 文档）：低级钩子回调要在 `LowLevelHooksTimeout` 内返回，超时后系统会跳过它，Windows 7 起还会不通知地直接把钩子摘掉（[LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)）。所以钩子线程只能做判断和投递消息，不能在里面做任何耗时操作。前台是管理员权限的窗口时，非管理员进程的钩子是否还能收到按键：**未核实**（EcoPaste 有「以管理员身份运行」选项 `src-tauri/src/admin.rs`，可能与此有关）。

**做法 B：`DisabledHotkeys` + 重启 Explorer（QuickClipboard、TieZ）**。

- QuickClipboard `src-tauri/src/services/system/win_v_hotkey.rs`：打开 `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`，往字符串值 `DisabledHotkeys` 末尾加 `V`（已有就不加），`taskkill /F /IM explorer.exe` 后等 1 秒再 `start explorer.exe`；恢复时把 `V` 删掉，删空了就删除这个值，再重启一次 Explorer。
- TieZ `src-tauri/src/app/commands/system_cmd.rs`（`trigger_registry_win_v_optimization`）做得更彻底：除了 `DisabledHotkeys`，还把 `HKCU\Software\Microsoft\Clipboard` 下的 `EnableClipboardHistory`、`EnableCloudClipboard` 设成 0；恢复时还会清除 `DisallowClipboardHistory`、`AllowClipboardHistory`、`AllowCrossDeviceClipboard` 这几个策略值。卸载时 `src-tauri/nsis/uninstall.nsh` 把上面全部改回去，再用 PowerShell 重启 Explorer。
- `DisabledHotkeys` 本身是一个老的、没有正式文档的 Explorer 值（字母即对应 Win+字母），网上的资料都是第三方的（[gHacks](https://www.ghacks.net/2015/03/22/how-to-disable-specific-global-hotkeys-in-windows/)）。**没找到微软文档确认它在 Windows 11 当前版本上对 Win+V 有效**，但两个活跃项目都在用。
- 副作用：杀 Explorer 会让任务栏、托盘图标、打开的资源管理器窗口全部重建（我们的托盘图标也会被重建，要处理 `TaskbarCreated`）；关闭功能、卸载、应用崩溃后能不能恢复全看清理逻辑写得好不好；这改的是用户全局设置。
- 另一个更粗暴的做法：`HKLM\SOFTWARE\Microsoft\Clipboard\IsCloudAndHistoryFeatureAvailable = 0` 后重启，整个系统剪贴板历史功能从设置里消失（[EcoPaste #1092 的评论](https://github.com/EcoPasteHub/EcoPaste/issues/1092)）。要管理员权限，只适合作为文档里给用户的手动方案。

**做法 C：不做（Ditto）**。维护者两次拒绝：[#143](https://github.com/sabrogden/Ditto/issues/143)（2021，建议 AutoHotkey；社区给出的方案是把 Ditto 设成 Win+Shift+V，再用 AHK 把 Win+V 映射过去）、[#783](https://github.com/sabrogden/Ditto/issues/783)（2025-01-16：「不 hook Windows 提供之外的快捷键」）。PowerToys Keyboard Manager 也可以改键。CopyQ：**没找到**内置接管 Win+V 的资料。

**对我们的建议**：做成「快捷键」页里一个默认关闭的开关「使用 Win+V 打开剪贴板历史」，实现照 EcoPaste 的钩子方案，放在 `src-tauri/src/win32/` 里（钩子回调只判断并 `PostMessage` 到现有的剪贴板消息窗口）；剪贴板历史关闭时一起摘掉钩子。要处理 #1466 那种 Win 一直按住的情况（以 Win 抬起为周期重置状态，而不是 V 抬起）。不改注册表、不重启 Explorer。

### 三、独立弹窗和粘贴回原窗口

我们现在的形态是展开岛屿上的剪贴板页，点一条只复制。剪贴板管理器的核心体验是「按快捷键 → 选一条 → 内容直接出现在刚才的输入框」，我们还没有最后这一步。

**焦点策略两种**：

1. **弹窗不拿焦点（EcoPaste）**。`src-tauri/src/window/windows.rs`：显示剪贴板窗口前 `set_focusable(false)`，显示后开启 `keyboard::enable_navigation_keys`（又一个 `WH_KEYBOARD_LL` 钩子，只在窗口可见时装，吞掉并转发方向键、回车、Esc、Tab、空格预览，以及 Ctrl+数字等少数组合）和鼠标钩子（点窗口外面就隐藏）。用户要在搜索框打字或编辑备注时，临时 `set_focusable(true)` 并记下之前的前台窗口，编辑结束后 `SetForegroundWindow` 还回去。好处：原窗口的光标和选区完全不受影响，粘贴就是一次 `SendInput`。代价：可见期间多一个全局键盘钩子，搜索要先切到「编辑态」。
2. **记住原窗口再还回去（Ditto、QuickClipboard）**。Ditto `src/ExternalWindowTracker.cpp`：弹出前 `GetForegroundWindow`，可选再用 `GetGUIThreadInfo` 拿到焦点控件；粘贴时 `AttachThreadInput` 到前台线程、`SetForegroundWindow`，然后 `WaitForActiveWnd` 轮询直到它真的回到前台（有超时设置），延迟一小段时间再发按键。还支持**按目标程序配置粘贴按键串**（`GetPasteString(app)`），以及给管理员权限窗口粘贴的辅助进程（`PasteAsAdmin`）。QuickClipboard `src-tauri/src/services/system/focus.rs`：用 WinEvent 钩子持续记录最后一个外部前台窗口（排除自己的窗口），粘贴前 `SetForegroundWindow`。

对我们来说：岛屿是 `main` 窗口，展开时是否拿焦点要看现有的窗口逻辑。比较稳的路线是方案 2：快捷键触发时（在 `WM_HOTKEY` 处理里，焦点还没变）记下前台窗口；选中条目后写剪贴板、收起岛屿、还焦点、`SendInput` Ctrl+V。

**发什么键**：EcoPaste `src-tauri/src/keystroke/windows.rs` 发 Ctrl 按下、V 按下、V 抬起、Ctrl 抬起四个事件，注释写明不用 Shift+Insert，因为 Monaco（VS Code 聊天输入框等）把 Insert 当成改写模式切换。**终端例外**：Windows Terminal 默认把 Ctrl+V 绑定成自己的文本粘贴，图片要 Alt+V 才进到 Claude Code（见下一节）。

**弹出位置**：EcoPaste `WindowPosition` 有 `FollowCursor`（默认）/ `Center` / `Remember`；QuickClipboard「跟随光标唤出」「记忆位置 / 尺寸」。Ditto 的源码里在选项和弹窗代码中引用了文本光标（caret）位置，即可以弹在输入光标旁边（`src/OptionsGeneral.cpp`、`src/QPasteWnd.cpp` 有 `CaretPos`，未逐行核实具体选项名）。我们是「岛」，固定在顶部展开反而是自己的特点，不一定要跟随鼠标。

**键盘操作**（几家共有）：打开后直接打字就是搜索（Ditto 的「查找即输入」）；↑↓ 选择，回车粘贴，Esc 关闭；**数字键 1-9 直接粘贴第 N 条**（QuickClipboard、Maccy 的 ⌥+数字）；**带修饰键回车 = 纯文本粘贴**（Maccy ⌥⇧回车）；空格预览（EcoPaste，按住显示松开关闭）。

### 四、图片：剪贴板格式和终端 CLI

**格式**（[Microsoft Learn：Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats)）：系统会在 `CF_BITMAP`、`CF_DIB`、`CF_DIBV5` 之间自动合成，所以放 `CF_DIB` 或 `CF_DIBV5` 一个就够；微软建议位图优先放 DIB 而不是 `CF_BITMAP`。`PNG` 是浏览器、截图工具常用的注册格式，能保留透明度。文件列表是 `CF_HDROP`。多种格式按「信息量从多到少」的顺序放。

- 我们用的 `arboard`（3.7.0，2026-10-15）在 Windows 上写图片时**同时放 `PNG` 注册格式和 `CF_DIBV5`**；读图片时**先读 `PNG`，没有再读 `CF_DIBV5`**（[`src/platform/windows.rs`](https://github.com/1Password/arboard/blob/master/src/platform/windows.rs)）。所以我们写回的图片对一般程序来说没问题。
- EcoPaste 读取时也是「PNG 直通优先」，没有 PNG 才解码 DIB 再编码（`src-tauri/src/clipboard/read.rs`）。
- QuickClipboard 的 `set_clipboard_image_file`（`src-tauri/src/services/paste/clipboard_content.rs`）一次放三种：`CF_DIB`、`PNG`、`CF_HDROP`（指向图片文件）。这样贴到聊天软件、画图、资源管理器、终端都能用。

**Claude Code CLI 在 Windows 上的情况**：

- 文档：图片粘贴是 `Ctrl+V`，在 Windows 和 WSL 上是 `Alt+V`，粘贴后在光标处插入 `[Image #N]`（[Interactive mode](https://code.claude.com/docs/en/interactive-mode)）。原因是 Windows Terminal 把 Ctrl+V 绑定成了自己的文本粘贴，按键到不了 Claude Code（[#68021](https://github.com/anthropics/claude-code/issues/68021)）。
- 实现：每次 Alt+V 依次起三个 `powershell.exe`：`[System.Windows.Forms.Clipboard]::ContainsImage()` 检查、`GetImage()` 存成临时 PNG、`Remove-Item` 删临时文件，合计 1～2.6 秒（[#100899](https://github.com/anthropics/claude-code/issues/100899)）。`ContainsImage` 认的是 Bitmap，系统会从 `CF_DIBV5` 合成，所以我们写回的图片在格式上满足要求。
- 未修的读取 bug：剪贴板里明明有 `PNG` + `Bitmap` 也报「No image found in clipboard」（[#68021](https://github.com/anthropics/claude-code/issues/68021)，已因不活跃关闭；[#90657](https://github.com/anthropics/claude-code/issues/90657)）、几分钟后失效（[#103062](https://github.com/anthropics/claude-code/issues/103062)）、整场会话都失败（[#69234](https://github.com/anthropics/claude-code/issues/69234)）、第一次失败第二次成功（#68021 评论、[#78395](https://github.com/anthropics/claude-code/issues/78395)）。
- **能绕开的路**：
  - #68021 的评论：读取只在**原始位图**上失败，剪贴板里是**文件引用**时一直正常；有人用 AutoHotkey 在 Windows Terminal 里拦下 Ctrl+V，把剪贴板图片转成临时 PNG 的文件拖放（file-drop）格式再粘贴（[yvoolab/claude-code-windows-screenshot-paste](https://github.com/yvoolab/claude-code-windows-screenshot-paste)，没打开核实）。
  - 粘贴的文本里有图片路径时，Claude Code 会把它当成图片附上：[#105249](https://github.com/anthropics/claude-code/issues/105249)、[#105680](https://github.com/anthropics/claude-code/issues/105680) 都是有人想关掉这个行为。也就是说，**贴路径文本这条路现在可行**，而且是用普通 Ctrl+V（Windows Terminal 的文本粘贴），不依赖 Alt+V 和 PowerShell。缺点是将来 Claude Code 如果加了「不把路径当图片」的开关，用户打开后就失效。
  - Windows Terminal 1.24 / 1.25 起，剪贴板里只有图片时按 Ctrl+V 会发一个空的括号粘贴（`ESC[200~ESC[201~`），让 CLI 知道「用户粘贴了，但不是文本」（[microsoft/terminal#20037](https://github.com/microsoft/terminal/pull/20037)）。[#101869](https://github.com/anthropics/claude-code/issues/101869) 说 Claude Code 还没用这个信号（openai/codex 已经用了）。这件事要等 Claude Code 改，我们管不了。
- **对我们的建议**：
  1. 图片条目的操作菜单加「**复制为文件**」：参照 QuickClipboard 一次放 `CF_DIB`、`PNG`、`CF_HDROP`，`CF_HDROP` 指向历史里已有的原图 PNG（`clipboard-images/<hash>.png`）。注意：资源管理器里粘贴会**复制出一个文件**，Word 之类可能插入文件而不是图片，所以作为单独的操作，不改默认写回。条目删除后路径会失效，可以在写入前把文件复制到临时目录里一个带时间戳的名字。
  2. 加「**复制路径**」：写入带引号的绝对路径文本，在任何终端里都能用 Ctrl+V 贴，Claude Code、Codex 等会把它当图片。
  3. 以后做自动粘贴时：目标进程是 `WindowsTerminal.exe`（或用户配置的终端列表）且条目是图片，就发 Alt+V，或者改用「复制路径」再发 Ctrl+V。Ditto 的「按程序配置粘贴按键」就是这个思路。
  4. 写回时自己保证一定有 `PNG`（`arboard` 已做到），不只放 `CF_BITMAP`。

### 五、功能清单对比

| 功能 | Win+V | Ditto | CopyQ | EcoPaste | PasteBar | QuickClipboard / TieZ | 我们 |
|---|---|---|---|---|---|---|---|
| 文本 / 图片 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| HTML / RTF 富文本 | HTML | ✓ | ✓ | ✓ | 未核实 | ✓ | ✗ |
| 文件 / 文件夹 | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 固定 / 收藏 | 固定 | ✓ | ✓ | 固定 + 收藏 | ✓ | ✓ | 收藏 |
| 分组 / 标签 / 标签页 | ✗ | 分组 | 标签页 + 标签 | 自定义分组 | 收藏夹 / 标签页 / 看板 | 分组 / 多色标签 | ✗ |
| 备注 | ✗ | ✓ | ✓ | ✓ | ✓ | 未核实 | ✓ |
| 全文搜索 | ✗ | ✓ | ✓ | SQLite FTS5 | ✓ | ✓ | ✓（内存过滤） |
| 自动粘贴回原窗口 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 数字键快速粘贴 | ✗ | ✓ | 未核实 | Ctrl+数字 | 未核实 | 1-9 | ✗ |
| 纯文本粘贴 | ✗ | ✓ | ✓ | 复制 / 粘贴为纯文本 | ✓ | ✓ | 不适用（只存纯文本） |
| 文件粘贴为路径 | ✗ | 未核实 | 未核实 | `paste_files_as_path` | 未核实 | 未核实 | ✗ |
| 片段 / 模板 | ✗ | ✗ | 命令 | ✗ | 表单 + 全局模板 | ✗ | ✗ |
| 文本变换 / 脚本 | ✗ | 少量 | 脚本 API | ✗ | 未核实 | 未核实 | ✗（插件可读文本历史） |
| 顺序粘贴 / 粘贴栈 | ✗ | 未核实 | 可脚本实现 | ✗ | 未核实 | TieZ 顺序粘贴、QC 合并粘贴 | ✗ |
| 忽略密码管理器（格式） | 系统自己 | ✓ | ✓ | 未用格式，改用规则 + 应用排除 | 未核实 | TieZ ✓ | ✗ |
| 按应用排除 | ✗ | 未核实 | 按窗口 | ✓ | 未核实 | ✓ | ✗ |
| 密钥 / token 内容检测 | ✗ | ✗ | ✗ | ✓（私钥、JWT、AWS key 等） | ✗ | TieZ 预览打码 | ✗ |
| 来源应用和图标 | ✗ | 未核实 | 窗口标题 | ✓ | 未核实 | ✓ | ✗ |
| 条数上限 | 25 | ✓ | ✓ | ✓ | 无限 | ✓ | 5～200 |
| 按时间保留 | 重启清空 | 按天过期 | 未核实 | `Retention`（默认永久） | 未核实 | 清理规则 | ✗ |
| 单条大小上限 | 4 MB | 未核实 | 未核实 | 文本 4 MB / 图片 100 MB | 长度过滤 | 未核实 | 图片 PNG 10 MB |
| 加密 / 锁 | ✗ | 同步加密 | 加密标签页（GPG） | 加密备份 | PIN 保护收藏、锁屏 | 未核实 | ✗ |
| 导入 / 导出 | ✗ | ✓ | ✓ | `.ecopastebak`（可加密） | 备份恢复 | ZIP | ✗ |
| 跨设备同步 | 微软账户 | 局域网 | ✗（未核实） | ✗ | ✗ | WebDAV / 局域网 / MQTT | ✗ |
| OCR | ✗ | ✗ | ✗ | ✗ | ✗ | QuickClipboard ✓ | ✗ |
| 拖出到其他应用 | ✗ | 未核实 | ✓ | ✓ | 未核实 | 未核实 | ✗ |

来源：各项目 README（[EcoPaste](https://github.com/EcoPasteHub/EcoPaste)、[PasteBar](https://github.com/PasteBar/PasteBarApp)、[QuickClipboard](https://github.com/mosheng1/QuickClipboard)、[TieZ](https://github.com/jimuzhe/tiez-clipboard)、[CrossPaste](https://github.com/CrossPaste/crosspaste-desktop)、[Maccy](https://github.com/p0deje/Maccy)）、[CopyQ 主页](https://hluk.github.io/CopyQ/)、EcoPaste `src-tauri/src/settings/model.rs`。Ditto 的部分功能来自第三方介绍（[How-To Geek](https://www.howtogeek.com/the-free-open-source-clipboard-manager-i-use-instead-of-the-built-in-one/)），没打开 Ditto 的选项页核实，表里标的「未核实」没有算作事实。

**几项值得细说的**：

- **忽略密码管理器**。Microsoft 定义了三个注册格式（[Clipboard Formats › Cloud Clipboard and Clipboard History Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats)）：`ExcludeClipboardContentFromMonitorProcessing`（有就不进历史也不同步）、`CanIncludeInClipboardHistory`（DWORD 0 = 不进历史）、`CanUploadToCloudClipboard`（DWORD 0 = 不同步）。CopyQ 在 Windows 上检查这三个外加老的 `Clipboard Viewer Ignore`，命中就不存（[docs/security.rst](https://github.com/hluk/CopyQ/blob/master/docs/security.rst)）；Ditto（`src/CP_Main.cpp` 等）、TieZ、CrossPaste、SyncClipboard 都在源码里查这个格式。KeePass、1Password、Bitwarden 等密码管理器复制密码时会带这些格式（具体是哪一个未逐一核实）。我们**现在没有检查**，密码会被写进历史 JSON。实现很小：在 `read_clipboard_capture` 前 `RegisterClipboardFormatW` 拿到这几个 id，`IsClipboardFormatAvailable` 判断，命中就跳过。`arboard` 写入时也有 `exclude_from_history` 等选项，可以用在我们自己的划词翻译临时复制上，让它不进 Windows 自带的历史。
- **密钥内容检测**：EcoPaste `src-tauri/src/clipboard/secrets.rs` 只拦「高置信」的：PEM / OpenSSH 私钥块、带固定前缀的服务 token、AWS access key id、结构完整的 JWT、带明确字段名的 secret 赋值；刻意不拦普通长文本。可以直接参考这个范围（只写规则，不搬代码）。
- **来源应用**：EcoPaste `src-tauri/src/clipboard/source.rs` 在剪贴板变化回调里**立即同步**取 `GetForegroundWindow` → `QueryFullProcessImageNameW`（只需 `PROCESS_QUERY_LIMITED_INFORMATION`，不要管理员），拿 exe 路径作 id、提取图标；注释强调晚了前台就可能已经换了。这同时是「按应用排除」的基础。（`GetClipboardOwner` 是另一条路，但很多程序用隐藏窗口持有剪贴板，未核实哪种更准。）
- **回环抑制**：EcoPaste 写回前登记内容哈希，监听到同哈希就不新增（`src-tauri/src/clipboard/write.rs`）。我们用 `last_capture_hash` 做了同样的事。
- **存储**：EcoPaste、Ditto、QuickClipboard、PasteBar 都用 SQLite。我们是一个 JSON 文件，最多 200 条时没问题；如果要做无限历史、全文搜索、分组，就得换 SQLite，那是一次对外契约变更（应用数据目录的文件名在 contracts.md 里）。
- **同步**：做法分三类：自建服务器 / WebDAV / S3（SyncClipboard、TieZ、QuickClipboard）、局域网 P2P 加端到端加密（CrossPaste、UniClipboard、ClipCascade 的 P2P 模式）、系统账户（Win+V）。工作量都很大，而且和「悬浮岛」的定位关系不大。

## 优先级建议

**已经有的**（不用再做）：文本和图片历史、PNG 原图加缩略图、收藏（不被上限清掉）、备注、搜索、全部 / 收藏切换、5～200 条上限、可录制的全局快捷键、删除和清空、复制回剪贴板、写回时的回环抑制、划词翻译时暂停记录、插件只读文本历史。

**建议做的**（价值：高 / 中 / 低；工作量：小 ≈ 一两天以内，中 ≈ 几天，大 ≈ 一周以上）：

| 优先级 | 功能 | 价值 | 工作量 | 说明 |
|---|---|---|---|---|
| P0 | 忽略密码管理器内容（`ExcludeClipboardContentFromMonitorProcessing` / `CanIncludeInClipboardHistory=0` / `Clipboard Viewer Ignore`） | 高（隐私） | 小 | 只改 `service.rs` 的读取；可以默认开启、不加设置项 |
| P0 | 图片「复制为文件」（`CF_DIB` + `PNG` + `CF_HDROP`）和「复制路径」 | 高（直接解决 Claude Code 等终端 CLI 贴图） | 小～中 | 新增 Tauri 命令和条目菜单项；写 `CF_HDROP` 要在 `win32/` 里加一点代码 |
| P1 | 选中后自动粘贴回原窗口（记下前台窗口 → 还焦点 → `SendInput` Ctrl+V），加设置项「只复制 / 自动粘贴」 | 高（剪贴板工具的核心体验） | 中 | 要和岛屿展开、收起的焦点逻辑配合；终端里的图片改发 Alt+V 或贴路径 |
| P1 | 剪贴板页键盘操作：打开后直接打字搜索、↑↓、回车、Esc、数字键 1-9 | 高 | 小～中 | 依赖上一项才有完整意义 |
| P1 | 密钥 / token 内容检测（范围参考 EcoPaste：私钥、带前缀 token、JWT 等） | 中 | 小 | 默认开启；误判要少 |
| P2 | 来源应用（exe 和图标）+ 按应用排除列表 | 中 | 中 | 历史数据要加字段，兼容读取旧数据 |
| P2 | 按时间清理（如 7 天 / 30 天 / 永久，收藏除外） | 中 | 小 | |
| P2 | 接管 Win+V（低级键盘钩子，默认关闭） | 中（很多用户会问） | 中 | 不改注册表、不重启 Explorer；处理 EcoPaste #1466 的情况 |
| P2 | 文件 / 文件夹条目（`CF_HDROP`），附「粘贴为路径」 | 中 | 中 | |
| P3 | HTML / RTF 富文本，加「纯文本粘贴」 | 中 | 中 | `arboard` 能写 HTML；读 RTF 要自己处理 |
| P3 | 导入 / 导出（可选加密） | 低～中 | 中 | |
| P3 | 分组 / 标签 | 低～中 | 中～大 | 条数上限只有 200 时意义不大；做无限历史时再考虑 |
| P3 | 片段 / 模板、顺序粘贴 | 低 | 中 | 可以留给插件 |
| 不建议 | 跨设备同步、OCR、贴图到屏幕、Emoji 库、`DisabledHotkeys` 加重启 Explorer | — | 大 | 和岛屿定位关系小，或副作用大 |

## 来源

项目和源码（2026-11-09 查询）：

- EcoPaste：<https://github.com/EcoPasteHub/EcoPaste>；源码 `src-tauri/src/shortcut/win_v.rs`、`keystroke/windows.rs`、`window/windows.rs`、`keyboard/windows.rs`、`clipboard/{read,write,secrets,source}.rs`、`settings/model.rs`、`admin.rs`；[CHANGELOG](https://github.com/EcoPasteHub/EcoPaste/blob/master/CHANGELOG.md)；[#1092](https://github.com/EcoPasteHub/EcoPaste/issues/1092)、[#1466](https://github.com/EcoPasteHub/EcoPaste/issues/1466)、[PR #1273](https://github.com/EcoPasteHub/EcoPaste/pull/1273)
- QuickClipboard：<https://github.com/mosheng1/QuickClipboard>；`src-tauri/src/services/system/win_v_hotkey.rs`、`services/system/focus.rs`、`services/paste/clipboard_content.rs`
- TieZ：<https://github.com/jimuzhe/tiez-clipboard>；`src-tauri/src/app/commands/system_cmd.rs`、`src-tauri/nsis/uninstall.nsh`
- Ditto：<https://github.com/sabrogden/Ditto>；`src/ExternalWindowTracker.cpp`；[#143](https://github.com/sabrogden/Ditto/issues/143)、[#783](https://github.com/sabrogden/Ditto/issues/783)
- CopyQ：<https://github.com/hluk/CopyQ>、<https://hluk.github.io/CopyQ/>、[docs/security.rst](https://github.com/hluk/CopyQ/blob/master/docs/security.rst)
- PasteBar：<https://github.com/PasteBar/PasteBarApp>
- Maccy：<https://github.com/p0deje/Maccy>；Clipy：<https://github.com/Clipy/Clipy>；Flycut：<https://github.com/TermiT/Flycut>
- 同步类：[ClipCascade](https://github.com/Sathvik-Rao/ClipCascade)、[CrossPaste](https://github.com/CrossPaste/crosspaste-desktop)、[SyncClipboard](https://github.com/Jeric-X/SyncClipboard)、[UniClipboard](https://github.com/UniClipboard/UniClipboard)
- 其他：[Qopy](https://github.com/0PandaDEV/Qopy)、[Slackadays/Clipboard](https://github.com/Slackadays/Clipboard)
- arboard：[src/platform/windows.rs](https://github.com/1Password/arboard/blob/master/src/platform/windows.rs)
- Windhawk Win+V 模组：<https://gist.github.com/nielpattin/82122f86e8161d85f39703b7482b77cc>

Microsoft：

- [Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats)（合成格式、Cloud Clipboard and Clipboard History Formats）
- [LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc)（钩子超时）
- [Clipboard in Windows](https://support.microsoft.com/en-us/windows/clipboard-in-windows-c436501e-985d-1c8d-97ea-fe46ddf338c6)
- `DisabledHotkeys`：[gHacks](https://www.ghacks.net/2015/03/22/how-to-disable-specific-global-hotkeys-in-windows/)（第三方）

Claude Code 和终端：

- [Interactive mode](https://code.claude.com/docs/en/interactive-mode)
- anthropics/claude-code issue：[#68021](https://github.com/anthropics/claude-code/issues/68021)、[#69234](https://github.com/anthropics/claude-code/issues/69234)、[#78395](https://github.com/anthropics/claude-code/issues/78395)、[#90657](https://github.com/anthropics/claude-code/issues/90657)、[#100899](https://github.com/anthropics/claude-code/issues/100899)、[#101869](https://github.com/anthropics/claude-code/issues/101869)、[#103062](https://github.com/anthropics/claude-code/issues/103062)、[#105249](https://github.com/anthropics/claude-code/issues/105249)、[#105680](https://github.com/anthropics/claude-code/issues/105680)
- [microsoft/terminal#20037](https://github.com/microsoft/terminal/pull/20037)
- [yvoolab/claude-code-windows-screenshot-paste](https://github.com/yvoolab/claude-code-windows-screenshot-paste)（#68021 评论里提到，未打开核实）

本次下载的源码片段放在本机 `%TEMP%\cliprefs\`（eco、tiez、qc），不进仓库。
