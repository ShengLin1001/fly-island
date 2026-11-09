import { invoke } from "@tauri-apps/api/core";

// Mirrors the commands in src-tauri/src/cc_connect/mod.rs.

export const CC_CONNECT_PLUGIN_ID = "focusd.cc-connect";

/** A chat a cc-connect project has talked to; `key` is what `cc-connect send -s` takes. */
export type CcConnectChat = { key: string; platform: string; userName: string | null };

export type CcConnectProject = { name: string; chats: CcConnectChat[] };

/** The island's own cc-connect (the plugin's "run" setting); mirrors RunState in src-tauri/src/cc_connect/runner.rs. */
export type CcConnectRunState = "off" | "starting" | "running" | "external" | "noConfig" | "failed";

export type CcConnectStatus = {
  /** The program; null when it is nowhere to be found. */
  exe: string | null;
  exeSource: "setting" | "running" | "path" | "downloaded" | "installed" | null;
  /** Why the path set on the plugin page cannot be used. */
  exeError: string | null;
  /** Some cc-connect is running; sending only works then. */
  running: boolean;
  runner: CcConnectRunState;
  runnerError: string | null;
  dataDir: string;
  /** Whether cc-connect's config.toml is there. */
  config: boolean;
  /** The projects in it, chats or not. */
  configProjects: string[];
  /** The user's folder, the setup's default work folder. */
  home: string;
  projects: CcConnectProject[];
};

/** The platforms a bot can be set up for on the plugin page. */
export const CC_CONNECT_SETUP_PLATFORMS = ["telegram", "discord", "feishu"] as const;
export type CcConnectSetupPlatform = (typeof CC_CONNECT_SETUP_PLATFORMS)[number];

/** A Telegram or Discord token checked: the bot, Discord's invite link, who wrote to it on Telegram. */
export type CcConnectBotCheck = { name: string; inviteUrl: string | null; senders: { id: string; name: string }[] };

/** Feishu's QR setup; mirrors FeishuProgress in src-tauri/src/cc_connect/feishu.rs. */
export type CcConnectFeishuSetup = {
  running: boolean;
  /** The QR code as a data: URL while it waits for the scan. */
  qr: string | null;
  url: string | null;
  done: boolean;
  allowFrom: string | null;
  error: string | null;
};

export type CcConnectNewProject = { project: string; workDir: string; platform: CcConnectSetupPlatform; token: string; allowFrom: string };

/** `path`: the plugin's program setting; empty finds the program. */
export function getCcConnectStatus(path: string) {
  return invoke<CcConnectStatus>("get_cc_connect_status", { path: path.trim() || null });
}

export function sendCcConnectMessage(path: string, project: string, sessionKey: string, text: string) {
  return invoke<void>("send_cc_connect_message", { path: path.trim() || null, project, sessionKey, text });
}

/** Downloads the latest cc-connect into the island's data folder; resolves to where it is. */
export function installCcConnect() {
  return invoke<string>("install_cc_connect");
}

export function checkCcConnectBot(platform: CcConnectSetupPlatform, token: string) {
  return invoke<CcConnectBotCheck>("check_cc_connect_bot", { platform, token });
}

/** Adds the project to cc-connect's config; for Feishu this starts the QR setup instead. */
export function addCcConnectProject(path: string, project: CcConnectNewProject) {
  return invoke<void>("add_cc_connect_project", { path: path.trim() || null, ...project });
}

export function getCcConnectFeishuSetup() {
  return invoke<CcConnectFeishuSetup>("get_cc_connect_feishu_setup");
}

export function cancelCcConnectFeishuSetup() {
  return invoke<void>("cancel_cc_connect_feishu_setup");
}

/** A project name not in `taken`: "phone", else "phone-2" and on. */
export function freeProjectName(taken: string[], base = "phone") {
  for (let index = 1; ; index += 1) {
    const name = index === 1 ? base : `${base}-${index}`;
    if (!taken.includes(name)) return name;
  }
}

/** Whether `allowFrom` names who may use the bot: ids joined by commas, never "*" or empty. */
export function allowFromValid(allowFrom: string) {
  const ids = allowFrom.split(",").map((id) => id.trim());
  return ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
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
