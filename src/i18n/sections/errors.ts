/**
 * The wording of errors from the native side (task D15), by the code it sends
 * (src-tauri/src/user_error.rs). What an outside program or service said comes after it, as it is.
 */
export type ErrorArgs = Record<string, string | number>;
type Wording = string | ((args: ErrorArgs) => string);

export type ErrorCode =
  | "credential.open"
  | "credential.read"
  | "credential.save"
  | "credential.delete"
  | "http.client"
  | "bark.server"
  | "bark.scheme"
  | "bark.key"
  | "bark.noKey"
  | "bark.unreachable"
  | "bark.unknownKey"
  | "bark.status";

export type ErrorsText = {
  /** The wording, then what the program or service said. */
  withDetail: (text: string, detail: string) => string;
  codes: Record<ErrorCode, Wording>;
};

export const zhCN: ErrorsText = {
  withDetail: (text, detail) => `${text.replace(/[。.]$/, "")}：${detail}`,
  codes: {
    "credential.open": "无法访问 Windows 凭据管理器。",
    "credential.read": "无法从 Windows 凭据管理器读取。",
    "credential.save": "无法保存到 Windows 凭据管理器。",
    "credential.delete": "无法从 Windows 凭据管理器删除。",
    "http.client": "无法建立网络连接。",
    "bark.server": "Bark 服务器地址无效。",
    "bark.scheme": "Bark 服务器地址要以 https:// 或 http:// 开头。",
    "bark.key": "这不像 Bark 的设备 Key：在 Bark 里复制推送地址或其中那串字母数字。",
    "bark.noKey": "还没有填 Bark 设备 Key。",
    "bark.unreachable": "连不上 Bark 服务器。",
    "bark.unknownKey": "Bark 不认这个设备 Key，请重新复制。",
    "bark.status": ({ status }) => `Bark 返回 ${status}。`,
  },
};

export const en: ErrorsText = {
  withDetail: (text, detail) => `${text.replace(/\.$/, "")}: ${detail}`,
  codes: {
    "credential.open": "Could not open Windows Credential Manager.",
    "credential.read": "Could not read from Windows Credential Manager.",
    "credential.save": "Could not save to Windows Credential Manager.",
    "credential.delete": "Could not delete from Windows Credential Manager.",
    "http.client": "Could not set up the connection.",
    "bark.server": "The Bark server address is not valid.",
    "bark.scheme": "The Bark server address must start with https:// or http://.",
    "bark.key": "That does not look like a Bark device key: copy the push URL in Bark, or the letters and digits in it.",
    "bark.noKey": "No Bark device key yet.",
    "bark.unreachable": "Could not reach the Bark server.",
    "bark.unknownKey": "Bark does not know this device key; copy it again.",
    "bark.status": ({ status }) => `Bark answered ${status}.`,
  },
};
