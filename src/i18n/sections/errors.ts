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
  | "ccConnect.lost";

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
  },
};
