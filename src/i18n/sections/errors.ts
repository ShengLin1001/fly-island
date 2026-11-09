/**
 * The wording of errors from the native side (task D15), by the code it sends
 * (src-tauri/src/user_error.rs). What an outside program or service said comes after it, as it is.
 */
export type ErrorArgs = Record<string, string | number>;
type Wording = string | ((args: ErrorArgs) => string);

export type ErrorCode =
  | "internal"
  | "credential.open"
  | "credential.read"
  | "credential.save"
  | "credential.delete"
  | "file.read"
  | "file.write"
  | "file.create"
  | "file.backup"
  | "file.undo"
  | "http.client"
  | "net.proxy"
  | "net.unreachable"
  | "net.unreadable"
  | "net.status"
  | "net.said"
  | "net.tooLarge"
  | "bark.server"
  | "bark.scheme"
  | "bark.key"
  | "bark.noKey"
  | "bark.unreachable"
  | "bark.unknownKey"
  | "bark.status"
  | "ccConnect.token"
  | "ccConnect.noTokenCheck"
  | "ccConnect.telegramToken"
  | "ccConnect.telegramBusy"
  | "ccConnect.discordToken"
  | "ccConnect.discordId"
  | "ccConnect.projectName"
  | "ccConnect.projectTaken"
  | "ccConnect.workDir"
  | "ccConnect.platform"
  | "ccConnect.allowFrom"
  | "ccConnect.feishuRunning"
  | "ccConnect.feishuUnfinished"
  | "ccConnect.tag"
  | "ccConnect.asset"
  | "ccConnect.checksumMissing"
  | "ccConnect.checksum"
  | "ccConnect.arch"
  | "ccConnect.zip"
  | "ccConnect.zipEmpty"
  | "ccConnect.zipLarge"
  | "ccConnect.unpack"
  | "ccConnect.notAt"
  | "ccConnect.notFound"
  | "ccConnect.notFoundRun"
  | "ccConnect.notDownloaded"
  | "ccConnect.notReady"
  | "ccConnect.chat"
  | "ccConnect.emptyPush"
  | "ccConnect.run"
  | "ccConnect.stdin"
  | "ccConnect.timeout"
  | "ccConnect.failed"
  | "ccConnect.exited"
  | "ccConnect.lost"
  | "clipboard.read"
  | "clipboard.open"
  | "shortcut.invalid"
  | "shortcut.notReady"
  | "shortcut.busy"
  | "shortcut.update"
  | "shortcut.timeout"
  | "shortcut.taken"
  | "calendar.save"
  | "calendar.link"
  | "calendar.linkScheme"
  | "calendar.unreachable"
  | "calendar.login"
  | "calendar.status"
  | "calendar.read"
  | "calendar.tooLarge"
  | "calendar.address"
  | "calendar.https"
  | "calendar.notCalendar"
  | "calendar.noCalendars"
  | "calendar.linkExpired"
  | "calendar.notIcs"
  | "calendar.corrupt"
  | "calendar.secretMissing"
  | "calendar.tooMany"
  | "calendar.needLink"
  | "calendar.needPassword"
  | "calendar.needAccount"
  | "translation.provider"
  | "translation.url"
  | "translation.urlEmpty"
  | "translation.urlLong"
  | "translation.urlFull"
  | "translation.urlCredentials"
  | "translation.urlScheme"
  | "translation.urlQuery"
  | "translation.modelLong"
  | "translation.noModel"
  | "translation.noResult"
  | "translation.cutOff"
  | "translation.unfinished"
  | "translation.copy"
  | "translation.key"
  | "translation.empty"
  | "translation.tooLong"
  | "translation.direction"
  | "translation.noKey"
  | "translation.status"
  | "planUsage.key"
  | "mail.address"
  | "mail.attachmentDecode"
  | "mail.attachmentDownload"
  | "mail.attachmentGone"
  | "mail.attachmentLarge"
  | "mail.attachmentParse"
  | "mail.badId"
  | "mail.badPart"
  | "mail.bodyDecode"
  | "mail.bodyFormat"
  | "mail.bodyLarge"
  | "mail.bodyLoad"
  | "mail.bodyLong"
  | "mail.bodyOver"
  | "mail.bodyParse"
  | "mail.bodyPartial"
  | "mail.build"
  | "mail.cancelled"
  | "mail.changedOpen"
  | "mail.changedRefresh"
  | "mail.codeMissing"
  | "mail.connect"
  | "mail.connectAndEnable"
  | "mail.connectThis"
  | "mail.connectUnfinished"
  | "mail.crashedRetrying"
  | "mail.crashedStopped"
  | "mail.disconnect"
  | "mail.disconnectCredential"
  | "mail.disconnectPartly"
  | "mail.headers"
  | "mail.imapRefused"
  | "mail.imapServer"
  | "mail.inbox"
  | "mail.inboxChanged"
  | "mail.inboxChangedOpen"
  | "mail.markRead"
  | "mail.markReadLater"
  | "mail.needCode"
  | "mail.needRecipient"
  | "mail.noAttachment"
  | "mail.noDownloads"
  | "mail.noSender"
  | "mail.noText"
  | "mail.notReady"
  | "mail.notRecent"
  | "mail.read"
  | "mail.readCode"
  | "mail.readLater"
  | "mail.recipient"
  | "mail.removed"
  | "mail.saveAttachment"
  | "mail.saveCode"
  | "mail.sendFailed"
  | "mail.sendUnfinished"
  | "mail.serviceDown"
  | "mail.smtpRefused"
  | "mail.start"
  | "mail.stopped"
  | "mail.structure"
  | "mail.subject"
  | "mail.sync"
  | "mail.tls"
  | "mail.tooMany"
  | "mail.tooManyNames"
  | "mail.tooManyRecipients"
  | "mail.unavailable"
  | "mail.update";

export type ErrorsText = {
  /** The wording, then what the program or service said. */
  withDetail: (text: string, detail: string) => string;
  codes: Record<ErrorCode, Wording>;
};

export const zhCN: ErrorsText = {
  withDetail: (text, detail) => `${text.replace(/[。.]$/, "")}：${detail}`,
  codes: {
    internal: "岛屿内部出错。",
    "credential.open": "无法访问 Windows 凭据管理器。",
    "credential.read": "无法从 Windows 凭据管理器读取。",
    "credential.save": "无法保存到 Windows 凭据管理器。",
    "credential.delete": "无法从 Windows 凭据管理器删除。",
    "file.read": ({ path }) => `读不了 ${path}。`,
    "file.write": ({ path }) => `无法写入 ${path}。`,
    "file.create": ({ path }) => `无法创建 ${path}。`,
    "file.backup": ({ path }) => `无法备份 ${path}。`,
    "file.undo": ({ path }) => `无法撤回 ${path}。`,
    "http.client": "无法建立网络连接。",
    "net.proxy": ({ proxy }) => `代理地址 ${proxy} 无效。`,
    "net.unreachable": ({ service }) => `连不上 ${service}。`,
    "net.unreadable": ({ service }) => `${service} 的回答读不懂。`,
    "net.status": ({ service, status }) => `${service} 返回 ${status}。`,
    "net.said": ({ service }) => `${service} 返回了错误。`,
    "net.tooLarge": ({ service }) => `${service} 的内容太大，已放弃。`,
    "bark.server": "Bark 服务器地址无效。",
    "bark.scheme": "Bark 服务器地址要以 https:// 或 http:// 开头。",
    "bark.key": "这不像 Bark 的设备 Key：在 Bark 里复制推送地址或其中那串字母数字。",
    "bark.noKey": "还没有填 Bark 设备 Key。",
    "bark.unreachable": "连不上 Bark 服务器。",
    "bark.unknownKey": "Bark 不认这个设备 Key，请重新复制。",
    "bark.status": ({ status }) => `Bark 返回 ${status}。`,
    "ccConnect.token": "机器人 token 不对。",
    "ccConnect.noTokenCheck": ({ platform }) => `${platform} 不用检查 token。`,
    "ccConnect.telegramToken": "Telegram 不认这个 token，请从 BotFather 重新复制。",
    "ccConnect.telegramBusy": "这个机器人正被别的程序（多半是 cc-connect）收消息，先停掉它再识别。",
    "ccConnect.discordToken": "Discord 不认这个 token，请在开发者门户的 Bot 页重新生成并复制。",
    "ccConnect.discordId": "Discord 没给出机器人的 id。",
    "ccConnect.projectName": "项目名只能用字母、数字、- 和 _，最多 64 个字符。",
    "ccConnect.projectTaken": ({ name }) => `cc-connect 已经有叫 ${name} 的项目了，换个名字。`,
    "ccConnect.workDir": ({ path }) => `工作文件夹不存在：${path}`,
    "ccConnect.platform": ({ platform }) => `不支持的平台：${platform}`,
    "ccConnect.allowFrom": "请填写你自己的用户 ID（多个用英文逗号隔开），不然谁找到机器人都能用这台电脑。",
    "ccConnect.feishuRunning": "飞书扫码已经在进行了。",
    "ccConnect.feishuUnfinished": "飞书扫码没有完成。",
    "ccConnect.tag": ({ tag }) => `cc-connect 的版本号不对：${tag}`,
    "ccConnect.asset": ({ tag, name }) => `cc-connect ${tag} 没有发布 ${name}。`,
    "ccConnect.checksumMissing": ({ name }) => `checksums.txt 里没有 ${name}。`,
    "ccConnect.checksum": "下载的 cc-connect 和发布的校验值对不上，已丢弃。",
    "ccConnect.arch": ({ arch }) => `cc-connect 没有 ${arch} 版的 Windows 程序。`,
    "ccConnect.zip": "cc-connect 的压缩包读不了。",
    "ccConnect.zipEmpty": "cc-connect 的压缩包里没有程序。",
    "ccConnect.zipLarge": "cc-connect 的程序大得不正常，已放弃。",
    "ccConnect.unpack": "解压 cc-connect 失败。",
    "ccConnect.notAt": ({ path }) => `找不到 cc-connect 程序：${path}`,
    "ccConnect.notFound": "找不到 cc-connect 程序，请在插件里填写它的路径。",
    "ccConnect.notFoundRun": "找不到 cc-connect 程序，请先下载或填写路径。",
    "ccConnect.notDownloaded": "找不到 cc-connect 程序，请先下载。",
    "ccConnect.notReady": "cc-connect 还没准备好。",
    "ccConnect.chat": "cc-connect 项目或聊天无效。",
    "ccConnect.emptyPush": "推送内容是空的。",
    "ccConnect.run": "无法运行 cc-connect。",
    "ccConnect.stdin": "无法把内容交给 cc-connect。",
    "ccConnect.timeout": "cc-connect 10 秒没有回应。",
    "ccConnect.failed": "cc-connect 出错。",
    "ccConnect.exited": "cc-connect 退出了。",
    "ccConnect.lost": "和 cc-connect 失去了联系。",
    "clipboard.read": "无法读取剪贴板。",
    "clipboard.open": "无法打开剪贴板。",
    "shortcut.invalid": "快捷键无效，请使用至少一个修饰键。",
    "shortcut.notReady": "快捷键服务尚未准备好。",
    "shortcut.busy": "快捷键正在更新。",
    "shortcut.update": "无法更新快捷键。",
    "shortcut.timeout": "快捷键更新超时。",
    "shortcut.taken": ({ shortcut }) => `快捷键 ${shortcut} 已被占用或无法注册。`,
    "calendar.save": "无法保存日历设置。",
    "calendar.link": "订阅链接无效。",
    "calendar.linkScheme": "订阅链接要以 https:// 或 webcal:// 开头。",
    "calendar.unreachable": "连不上日历。",
    "calendar.login": "日历账号或密码不对。",
    "calendar.status": ({ status }) => `日历返回 ${status}。`,
    "calendar.read": "读取日历失败。",
    "calendar.tooLarge": "日历文件太大。",
    "calendar.address": "日历地址无效。",
    "calendar.https": "日历地址要以 https:// 开头。",
    "calendar.notCalendar": "这个地址不是日历，也找不到账号下的日历。",
    "calendar.noCalendars": "找不到账号下的日历。",
    "calendar.linkExpired": "订阅链接已失效，或没有权限。",
    "calendar.notIcs": "这个链接不是日历（iCalendar）。",
    "calendar.corrupt": "日历内容损坏。",
    "calendar.secretMissing": "找不到保存的密码或订阅链接，请删掉这个日历再加一次。",
    "calendar.tooMany": ({ max }) => `最多添加 ${max} 个日历。`,
    "calendar.needLink": "请填写订阅链接。",
    "calendar.needPassword": "请填写密码。",
    "calendar.needAccount": "请填写账号。",
    "translation.provider": ({ service }) => `不支持的翻译服务：${service}`,
    "translation.url": "接口地址无效。",
    "translation.urlEmpty": "请填写自定义接口地址。",
    "translation.urlLong": "接口地址过长。",
    "translation.urlFull": "接口地址无效，请填写完整的 https:// 地址。",
    "translation.urlCredentials": "接口地址中不能包含用户名或密码，密钥请填在密钥栏。",
    "translation.urlScheme": "接口地址必须使用 https（本机地址可用 http）。",
    "translation.urlQuery": "接口地址不能带查询参数。",
    "translation.modelLong": "模型名称过长。",
    "translation.noModel": ({ service }) => `请先在翻译设置中填写${service}的模型名称。`,
    "translation.noResult": ({ service }) => `${service} 未返回译文。`,
    "translation.cutOff": ({ service }) => `${service} 未完成翻译，请重试或缩短文本。`,
    "translation.unfinished": ({ service }) => `${service} 未完成翻译。`,
    "translation.copy": "无法复制译文。",
    "translation.key": "请输入有效的 API 密钥。",
    "translation.empty": "请输入要翻译的内容。",
    "translation.tooLong": ({ max }) => `单次最多翻译 ${max} 个字符。`,
    "translation.direction": "不支持的翻译方向。",
    "translation.noKey": ({ service }) => `请先配置${service}的 API 密钥。`,
    "translation.status": ({ service, status }) => `${service} 返回 HTTP ${status}，请检查密钥、模型名称或额度。`,
    "planUsage.key": "API Key 格式不对。",
    "mail.address": "请输入有效的邮箱地址。",
    "mail.attachmentDecode": "无法解码附件，请在网页中下载。",
    "mail.attachmentDownload": "无法下载附件，请检查网络并重试。",
    "mail.attachmentGone": "附件已移除，请刷新收件箱。",
    "mail.attachmentLarge": ({ mb }) => `附件超过 ${mb} MB，请在网页中下载。`,
    "mail.attachmentParse": "无法解析附件，请在网页中下载。",
    "mail.badId": "邮件标识无效，请刷新收件箱。",
    "mail.badPart": "附件标识无效，请重新打开邮件。",
    "mail.bodyDecode": "无法解码邮件正文，请在网页中查看。",
    "mail.bodyFormat": "邮件正文格式不匹配，请在网页中查看。",
    "mail.bodyLarge": "邮件正文过大，请在网页中查看。",
    "mail.bodyLoad": "无法加载邮件正文，请检查网络并重试。",
    "mail.bodyLong": "正文太长，请在网页中发送。",
    "mail.bodyOver": "邮件正文超过 512 KB，请在网页中查看。",
    "mail.bodyParse": "无法解析邮件正文，请在网页中查看。",
    "mail.bodyPartial": "邮件正文未完整加载，请重试。",
    "mail.build": "无法生成邮件。",
    "mail.cancelled": "邮箱连接已取消。",
    "mail.changedOpen": "邮箱连接已改变，请重新打开邮件。",
    "mail.changedRefresh": "邮箱连接已改变，请刷新收件箱。",
    "mail.codeMissing": "未找到保存的邮箱授权码，请重新连接。",
    "mail.connect": "请先连接邮箱。",
    "mail.connectAndEnable": "请先连接并开启邮箱接收。",
    "mail.connectThis": "请先连接这个邮箱。",
    "mail.connectUnfinished": "邮箱连接任务未完成。",
    "mail.crashedRetrying": "邮箱后台连接意外中断，正在重新连接。",
    "mail.crashedStopped": "邮箱后台连接多次意外中断，已停止重试。请在设置里重新授权或暂停后再接收，也可以重启岛屿。",
    "mail.disconnect": "无法断开邮箱。",
    "mail.disconnectCredential": "删除邮箱凭据失败，请重试断开。",
    "mail.disconnectPartly": "已停止接收，但删除 Windows 邮箱凭据失败，请重试断开。",
    "mail.headers": "无法读取邮件头。",
    "mail.imapRefused": "邮箱拒绝了连接，请确认已开启 IMAP，并重新输入邮箱授权码。",
    "mail.imapServer": "IMAP 服务器地址无效：填写域名，需要时加端口，例如 imap.example.com 或 imap.example.com:9993。",
    "mail.inbox": "无法打开收件箱，请稍后重试。",
    "mail.inboxChanged": "收件箱已更新，请刷新列表后重试。",
    "mail.inboxChangedOpen": "收件箱已更新，请刷新列表后重新打开邮件。",
    "mail.markRead": "无法把邮件标为已读。",
    "mail.markReadLater": "无法把邮件标为已读，请稍后重试。",
    "mail.needCode": "请输入邮箱设置中生成的授权码。",
    "mail.needRecipient": "请填写收件人。",
    "mail.noAttachment": "找不到这个附件，请重新打开邮件。",
    "mail.noDownloads": "找不到下载文件夹。",
    "mail.noSender": "找不到这封邮件的发件人。",
    "mail.noText": "这封邮件没有可读取的文字正文，请在网页中查看。",
    "mail.notReady": "邮箱服务尚未就绪。",
    "mail.notRecent": "邮件已不在最近列表中，请刷新收件箱。",
    "mail.read": "无法读取邮件。",
    "mail.readCode": "无法读取 Windows 邮箱凭据，请重新连接。",
    "mail.readLater": "无法读取邮件，请稍后重试。",
    "mail.recipient": ({ address }) => `收件人地址无效：${address}`,
    "mail.removed": "邮件已移除，请刷新收件箱。",
    "mail.saveAttachment": "无法保存附件。",
    "mail.saveCode": "无法保存到 Windows 凭据管理器，请重试连接。",
    "mail.sendFailed": "发送失败，请检查网络后重试。",
    "mail.sendUnfinished": "发送任务未完成。",
    "mail.serviceDown": "邮箱服务不可用。",
    "mail.smtpRefused": "发件服务器拒绝了登录或邮件，请确认已开启 SMTP 服务、授权码正确，以及收件人地址。",
    "mail.start": "无法启动邮箱服务。",
    "mail.stopped": "邮箱后台连接已停止，请在设置里重新授权，或暂停后再接收。",
    "mail.structure": "无法读取邮件结构，请稍后重试。",
    "mail.subject": "主题太长或包含换行。",
    "mail.sync": "无法同步邮箱，请检查网络或稍后重试。",
    "mail.tls": "无法建立加密连接。",
    "mail.tooMany": ({ max }) => `最多同时连接 ${max} 个邮箱，请先断开一个。`,
    "mail.tooManyNames": "下载文件夹里同名文件太多，请清理后重试。",
    "mail.tooManyRecipients": ({ max }) => `一封邮件最多 ${max} 个收件人。`,
    "mail.unavailable": "邮件已移除或暂不可用，请刷新收件箱。",
    "mail.update": "无法更新邮箱连接。",
  },
};

export const en: ErrorsText = {
  withDetail: (text, detail) => `${text.replace(/\.$/, "")}: ${detail}`,
  codes: {
    internal: "Something went wrong inside the island.",
    "credential.open": "Could not open Windows Credential Manager.",
    "credential.read": "Could not read from Windows Credential Manager.",
    "credential.save": "Could not save to Windows Credential Manager.",
    "credential.delete": "Could not delete from Windows Credential Manager.",
    "file.read": ({ path }) => `Could not read ${path}.`,
    "file.write": ({ path }) => `Could not write ${path}.`,
    "file.create": ({ path }) => `Could not create ${path}.`,
    "file.backup": ({ path }) => `Could not back up ${path}.`,
    "file.undo": ({ path }) => `Could not undo ${path}.`,
    "http.client": "Could not set up the connection.",
    "net.proxy": ({ proxy }) => `Invalid proxy ${proxy}.`,
    "net.unreachable": ({ service }) => `Could not reach ${service}.`,
    "net.unreadable": ({ service }) => `Could not read ${service}'s answer.`,
    "net.status": ({ service, status }) => `${service} answered ${status}.`,
    "net.said": ({ service }) => `${service} answered with an error.`,
    "net.tooLarge": ({ service }) => `${service} sent more than expected; gave up.`,
    "bark.server": "The Bark server address is not valid.",
    "bark.scheme": "The Bark server address must start with https:// or http://.",
    "bark.key": "That does not look like a Bark device key: copy the push URL in Bark, or the letters and digits in it.",
    "bark.noKey": "No Bark device key yet.",
    "bark.unreachable": "Could not reach the Bark server.",
    "bark.unknownKey": "Bark does not know this device key; copy it again.",
    "bark.status": ({ status }) => `Bark answered ${status}.`,
    "ccConnect.token": "That bot token does not look right.",
    "ccConnect.noTokenCheck": ({ platform }) => `${platform} has no token to check.`,
    "ccConnect.telegramToken": "Telegram does not know this token; copy it again from BotFather.",
    "ccConnect.telegramBusy": "Another program (most likely cc-connect) is receiving this bot's messages; stop it, then look again.",
    "ccConnect.discordToken": "Discord does not know this token; reset and copy it on the Bot page of the Developer Portal.",
    "ccConnect.discordId": "Discord did not give the bot's id.",
    "ccConnect.projectName": "A project name takes letters, digits, - and _, up to 64 characters.",
    "ccConnect.projectTaken": ({ name }) => `cc-connect already has a project called ${name}; pick another name.`,
    "ccConnect.workDir": ({ path }) => `The work folder does not exist: ${path}`,
    "ccConnect.platform": ({ platform }) => `Unsupported platform: ${platform}`,
    "ccConnect.allowFrom": "Fill in your own user ID (several separated by commas), or anyone who finds the bot can use this computer.",
    "ccConnect.feishuRunning": "A Feishu QR setup is already running.",
    "ccConnect.feishuUnfinished": "The Feishu QR setup did not finish.",
    "ccConnect.tag": ({ tag }) => `cc-connect's version tag is not valid: ${tag}`,
    "ccConnect.asset": ({ tag, name }) => `cc-connect ${tag} has no ${name}.`,
    "ccConnect.checksumMissing": ({ name }) => `checksums.txt does not list ${name}.`,
    "ccConnect.checksum": "The downloaded cc-connect does not match the release's checksum; it was thrown away.",
    "ccConnect.arch": ({ arch }) => `cc-connect has no Windows build for ${arch}.`,
    "ccConnect.zip": "Could not read the cc-connect zip.",
    "ccConnect.zipEmpty": "The cc-connect zip has no program in it.",
    "ccConnect.zipLarge": "The cc-connect program is unusually large; gave up.",
    "ccConnect.unpack": "Could not unpack cc-connect.",
    "ccConnect.notAt": ({ path }) => `cc-connect is not at ${path}`,
    "ccConnect.notFound": "cc-connect was not found; fill in its path in the plugin's settings.",
    "ccConnect.notFoundRun": "cc-connect was not found; download it or fill in its path first.",
    "ccConnect.notDownloaded": "cc-connect was not found; download it first.",
    "ccConnect.notReady": "cc-connect is not ready yet.",
    "ccConnect.chat": "The cc-connect project or chat is not valid.",
    "ccConnect.emptyPush": "The push has no text.",
    "ccConnect.run": "Could not run cc-connect.",
    "ccConnect.stdin": "Could not hand the text to cc-connect.",
    "ccConnect.timeout": "cc-connect did not answer within 10 seconds.",
    "ccConnect.failed": "cc-connect failed.",
    "ccConnect.exited": "cc-connect stopped.",
    "ccConnect.lost": "Lost track of cc-connect.",
    "clipboard.read": "Could not read the clipboard.",
    "clipboard.open": "Could not open the clipboard.",
    "shortcut.invalid": "That shortcut is not valid; use at least one modifier key.",
    "shortcut.notReady": "The shortcut service is not ready yet.",
    "shortcut.busy": "The shortcut is being changed already.",
    "shortcut.update": "Could not change the shortcut.",
    "shortcut.timeout": "Changing the shortcut took too long.",
    "shortcut.taken": ({ shortcut }) => `The shortcut ${shortcut} is taken or cannot be registered.`,
    "calendar.save": "Could not save the calendar settings.",
    "calendar.link": "The subscription link is not valid.",
    "calendar.linkScheme": "The subscription link must start with https:// or webcal://.",
    "calendar.unreachable": "Could not reach the calendar.",
    "calendar.login": "The calendar account or password is wrong.",
    "calendar.status": ({ status }) => `The calendar answered ${status}.`,
    "calendar.read": "Could not read the calendar.",
    "calendar.tooLarge": "The calendar is too large.",
    "calendar.address": "The calendar address is not valid.",
    "calendar.https": "The calendar address must start with https://.",
    "calendar.notCalendar": "This address is not a calendar, and no calendars were found for the account.",
    "calendar.noCalendars": "No calendars were found for the account.",
    "calendar.linkExpired": "The subscription link has expired, or does not allow access.",
    "calendar.notIcs": "This link is not a calendar (iCalendar).",
    "calendar.corrupt": "The calendar is damaged.",
    "calendar.secretMissing": "The saved password or link is missing; remove this calendar and add it again.",
    "calendar.tooMany": ({ max }) => `At most ${max} calendars.`,
    "calendar.needLink": "Fill in the subscription link.",
    "calendar.needPassword": "Fill in the password.",
    "calendar.needAccount": "Fill in the account.",
    "translation.provider": ({ service }) => `Unsupported translation service: ${service}`,
    "translation.url": "The service address is not valid.",
    "translation.urlEmpty": "Fill in the custom service address.",
    "translation.urlLong": "The service address is too long.",
    "translation.urlFull": "The service address is not valid; fill in the whole https:// address.",
    "translation.urlCredentials": "The service address cannot hold a user name or password; put the key in the key field.",
    "translation.urlScheme": "The service address must use https (http only for this computer).",
    "translation.urlQuery": "The service address cannot have query parameters.",
    "translation.modelLong": "The model name is too long.",
    "translation.noModel": ({ service }) => `Fill in the model name for ${service} in the translation settings first.`,
    "translation.noResult": ({ service }) => `${service} returned no translation.`,
    "translation.cutOff": ({ service }) => `${service} did not finish the translation; try again or shorten the text.`,
    "translation.unfinished": ({ service }) => `${service} did not finish the translation.`,
    "translation.copy": "Could not copy the translation.",
    "translation.key": "Enter a valid API key.",
    "translation.empty": "Enter the text to translate.",
    "translation.tooLong": ({ max }) => `At most ${max} characters at a time.`,
    "translation.direction": "Unsupported translation direction.",
    "translation.noKey": ({ service }) => `Set up the API key for ${service} first.`,
    "translation.status": ({ service, status }) => `${service} answered HTTP ${status}; check the key, the model name or the quota.`,
    "planUsage.key": "That does not look like an API key.",
    "mail.address": "Enter a valid email address.",
    "mail.attachmentDecode": "Could not decode the attachment; download it in the web mail.",
    "mail.attachmentDownload": "Could not download the attachment; check the network and try again.",
    "mail.attachmentGone": "The attachment was removed; refresh the inbox.",
    "mail.attachmentLarge": ({ mb }) => `The attachment is over ${mb} MB; download it in the web mail.`,
    "mail.attachmentParse": "Could not read the attachment; download it in the web mail.",
    "mail.badId": "The mail id is not valid; refresh the inbox.",
    "mail.badPart": "The attachment id is not valid; open the mail again.",
    "mail.bodyDecode": "Could not decode the mail body; open it in the web mail.",
    "mail.bodyFormat": "The mail body is not in the expected format; open it in the web mail.",
    "mail.bodyLarge": "The mail body is too large; open it in the web mail.",
    "mail.bodyLoad": "Could not load the mail body; check the network and try again.",
    "mail.bodyLong": "The text is too long; send it in the web mail.",
    "mail.bodyOver": "The mail body is over 512 KB; open it in the web mail.",
    "mail.bodyParse": "Could not read the mail body; open it in the web mail.",
    "mail.bodyPartial": "The mail body did not load completely; try again.",
    "mail.build": "Could not put the mail together.",
    "mail.cancelled": "The mail connection was cancelled.",
    "mail.changedOpen": "The mail connection changed; open the mail again.",
    "mail.changedRefresh": "The mail connection changed; refresh the inbox.",
    "mail.codeMissing": "The saved authorization code was not found; connect again.",
    "mail.connect": "Connect a mailbox first.",
    "mail.connectAndEnable": "Connect the mailbox and turn receiving on first.",
    "mail.connectThis": "Connect this mailbox first.",
    "mail.connectUnfinished": "Connecting did not finish.",
    "mail.crashedRetrying": "The mail connection broke off; connecting again.",
    "mail.crashedStopped": "The mail connection broke off several times and stopped retrying. Authorize again in Settings, pause and resume receiving, or restart the island.",
    "mail.disconnect": "Could not disconnect the mailbox.",
    "mail.disconnectCredential": "Deleting the saved code failed; disconnect again.",
    "mail.disconnectPartly": "Receiving stopped, but deleting the saved code from Windows Credential Manager failed; disconnect again.",
    "mail.headers": "Could not read the mail's headers.",
    "mail.imapRefused": "The mailbox refused the connection; check that IMAP is on and enter the authorization code again.",
    "mail.imapServer": "The IMAP server address is not valid: fill in a domain, with a port if needed, such as imap.example.com or imap.example.com:9993.",
    "mail.inbox": "Could not open the inbox; try again later.",
    "mail.inboxChanged": "The inbox changed; refresh the list and try again.",
    "mail.inboxChangedOpen": "The inbox changed; refresh the list and open the mail again.",
    "mail.markRead": "Could not mark the mail as read.",
    "mail.markReadLater": "Could not mark the mail as read; try again later.",
    "mail.needCode": "Enter the authorization code made in the mailbox settings.",
    "mail.needRecipient": "Fill in a recipient.",
    "mail.noAttachment": "This attachment was not found; open the mail again.",
    "mail.noDownloads": "The Downloads folder was not found.",
    "mail.noSender": "This mail's sender was not found.",
    "mail.noText": "This mail has no text to read; open it in the web mail.",
    "mail.notReady": "The mail service is not ready yet.",
    "mail.notRecent": "The mail is no longer in the recent list; refresh the inbox.",
    "mail.read": "Could not read the mail.",
    "mail.readCode": "Could not read the saved code from Windows Credential Manager; connect again.",
    "mail.readLater": "Could not read the mail; try again later.",
    "mail.recipient": ({ address }) => `Not a valid recipient address: ${address}`,
    "mail.removed": "The mail was removed; refresh the inbox.",
    "mail.saveAttachment": "Could not save the attachment.",
    "mail.saveCode": "Could not save to Windows Credential Manager; connect again.",
    "mail.sendFailed": "Sending failed; check the network and try again.",
    "mail.sendUnfinished": "Sending did not finish.",
    "mail.serviceDown": "The mail service is not available.",
    "mail.smtpRefused": "The mail server refused the sign-in or the mail; check that SMTP is on, the authorization code and the recipients.",
    "mail.start": "Could not start the mail service.",
    "mail.stopped": "The mail connection stopped; authorize again in Settings, or pause and resume receiving.",
    "mail.structure": "Could not read the mail's structure; try again later.",
    "mail.subject": "The subject is too long or has a line break.",
    "mail.sync": "Could not sync the mailbox; check the network or try again later.",
    "mail.tls": "Could not set up an encrypted connection.",
    "mail.tooMany": ({ max }) => `At most ${max} mailboxes at once; disconnect one first.`,
    "mail.tooManyNames": "Too many files with this name in Downloads; clear some and try again.",
    "mail.tooManyRecipients": ({ max }) => `At most ${max} recipients in one mail.`,
    "mail.unavailable": "The mail was removed or is not available; refresh the inbox.",
    "mail.update": "Could not update the mail connection.",
  },
};
