import { invoke } from "@tauri-apps/api/core";

// Mirrors the commands in src-tauri/src/cc_connect/mod.rs.

export const CC_CONNECT_PLUGIN_ID = "focusd.cc-connect";

/** A chat a cc-connect project has talked to; `key` is what `cc-connect send -s` takes. */
export type CcConnectChat = { key: string; platform: string; userName: string | null };

export type CcConnectProject = { name: string; chats: CcConnectChat[] };

export type CcConnectStatus = {
  /** The program; null when it is nowhere to be found. */
  exe: string | null;
  exeSource: "setting" | "running" | "path" | null;
  /** Why the path set on the plugin page cannot be used. */
  exeError: string | null;
  /** Some cc-connect is running; sending only works then. */
  running: boolean;
  dataDir: string;
  projects: CcConnectProject[];
};

/** `path`: the plugin's program setting; empty finds the program. */
export function getCcConnectStatus(path: string) {
  return invoke<CcConnectStatus>("get_cc_connect_status", { path: path.trim() || null });
}

export function sendCcConnectMessage(path: string, project: string, sessionKey: string, text: string) {
  return invoke<void>("send_cc_connect_message", { path: path.trim() || null, project, sessionKey, text });
}

/** The plugin's program setting, or "" (find it). */
export function programSetting(settings: Record<string, unknown>) {
  return typeof settings.path === "string" ? settings.path : "";
}

/** "Telegram · pj": the platform's name (from `platforms`, else its type), then the user's. */
export function chatLabel(chat: CcConnectChat, platforms: Record<string, string>) {
  const platform = platforms[chat.platform] ?? chat.platform;
  return chat.userName ? `${platform} · ${chat.userName}` : platform;
}
