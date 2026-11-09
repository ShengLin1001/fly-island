# 消息来源品牌图标

以下图标于 2026-10-19 从对应产品的官方网站取得，保留原始图片，仅在界面中等比例显示，用于标识消息来源。

| 文件 | 官网 | 原始资源 |
| --- | --- | --- |
| `qq.png` | [QQ](https://im.qq.com/index) | [官网图标](https://static-res.qq.com/static-res/imqq/qq-logo.png) |
| `wechat.png` | [微信 Windows](https://pc.weixin.qq.com/) | [官网 Apple Touch 图标](https://res.wx.qq.com/a/wx_fed/assets/res/OTE0YTAw.png) |

邮箱图标跟着邮箱地址的域名走（`src/features/messages/mail/mailProvider.ts`）：以下几家显示自己的图标，其他邮箱显示 `mail.png`。2026-11-09 取得：

| 文件 | 邮箱 | 原始资源 |
| --- | --- | --- |
| `mail-qq.png` | [QQ 邮箱](https://mail.qq.com/)（qq.com、foxmail.com） | [官网图标](https://res.wx.qq.com/t/webmail/webmail/res/images/qqmail_favicon_96h.8d124a7.png)，2026-10-19 取得 |
| `mail-netease.png` | [网易邮箱](https://mail.163.com/)（163.com、126.com、yeah.net） | [官网 Apple Touch 图标](https://mail.163.com/apple-touch-icon.png)（163 和 126 是同一张） |
| `mail-gmail.png` | [Gmail](https://mail.google.com/) | [Google 产品图标](https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png) |
| `mail-outlook.png` | [Outlook](https://outlook.live.com/)（outlook.com、hotmail.com、live.com） | [Microsoft 产品图标](https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/png/outlook_96x1.png) |

认不出的邮箱用 `mail.png`，它不用任何产品的标识：2026-11-09 用 ChatGPT 生成的通用信封图标（蓝靛渐变圆角底板、白色信封），裁去透明边距、缩到 180×180 并转为 8 位调色板 PNG。

以下 AI Agent 图标于 2026-11-04 取得，用于在小岛上标识正在运行的 Agent：

| 文件 | 官网 | 原始资源 |
| --- | --- | --- |
| `claude-code.png` | [Claude](https://claude.ai/) | [官网 Apple Touch 图标](https://claude.ai/apple-touch-icon.png) |
| `codex.webp` | [ChatGPT / Codex](https://chatgpt.com/) | [官网 Apple Touch 图标](https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.webp) |

QQ、微信、QQ 邮箱的品牌标识及相关权利归腾讯及对应权利人所有；网易邮箱标识归网易所有，Gmail 标识归 Google 所有，Outlook 标识归 Microsoft 所有；Claude 标识归 Anthropic 所有，OpenAI 标识归 OpenAI 所有。图标随应用打包，不在运行时请求远程图片。
