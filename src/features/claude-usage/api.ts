import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 与 src-tauri/src/claude_usage/mod.rs 中的 UsageWindow、UsageErrorKind、UsageError、ClaudeUsage 对应。
export type ClaudeUsageWindow = {
  /** 0–100. */
  percent: number;
  /** ISO 8601. */
  resetsAt: string | null;
};

export type ClaudeUsageErrorKind =
  | "noCredentials"
  | "tokenExpired"
  | "loginRequired"
  | "forbidden"
  | "rateLimited"
  | "network"
  | "http"
  | "invalidResponse";

export type ClaudeUsage = {
  fiveHour: ClaudeUsageWindow | null;
  sevenDay: ClaudeUsageWindow | null;
  source: "api" | "hud" | null;
  /** When the numbers were read (Unix ms). */
  updatedAt: number | null;
  /** The last refresh failed; the windows still hold the last good numbers. */
  error: { kind: ClaudeUsageErrorKind; message: string } | null;
  /** Goes up with every refresh; the higher one is newer. */
  revision: number;
};

export const CLAUDE_USAGE_UPDATED_EVENT = "claude-usage-updated";

/** The last snapshot, without a request. */
export function getClaudeUsage() {
  return invoke<ClaudeUsage>("get_claude_usage");
}

/** Asks now; within a minute of the last request or during a 429 cooldown it returns the last snapshot. */
export function refreshClaudeUsage() {
  return invoke<ClaudeUsage>("refresh_claude_usage");
}

/** 返回取消订阅函数的 Promise；调用方负责在卸载时取消。 */
export function listenClaudeUsage(handler: (usage: ClaudeUsage) => void) {
  return listen<ClaudeUsage>(CLAUDE_USAGE_UPDATED_EVENT, (event) => handler(event.payload));
}
