import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Mirrors ClaudeSession in src-tauri/src/claude_sessions/scan.rs. */
export type ClaudeSession = {
  sessionId: string;
  /** Any state claude-sessions writes other than these four reads as `idle`. */
  state: "needs" | "yourturn" | "working" | "done" | "idle";
  /**
   * `working`, but neither the state file nor the transcript moved for 3 minutes, and the
   * transcript shows no tool still running and no turn ended on ◐ (waiting on background work).
   */
  stale: boolean;
  title: string;
  cwd: string;
  /** Unix ms of the last hook. */
  updatedAt: number;
};

/**
 * Mirrors ClaudeSessionCounts in src-tauri/src/claude_sessions/scan.rs. `working` leaves out
 * stale sessions, `done` only counts the last 10 minutes, `total` is the sum of the rest.
 */
export type ClaudeSessionCounts = {
  needs: number;
  yourturn: number;
  working: number;
  stale: number;
  done: number;
  total: number;
};

/** Mirrors ClaudeSessionsSnapshot in src-tauri/src/claude_sessions/scan.rs. */
export type ClaudeSessionsSnapshot = {
  /** The state directory exists, i.e. claude-sessions' hooks are installed. */
  detected: boolean;
  stateDir: string;
  /**
   * Every session whose process still runs, needs > yourturn > working > stale > done > idle,
   * newest first. Idle sessions and ones done over 10 minutes ago are listed but not counted;
   * sessions without a terminal (`claude --bg`) are included.
   */
  sessions: ClaudeSession[];
  counts: ClaudeSessionCounts;
};

// Mirrors CLAUDE_SESSIONS_CHANGED_EVENT in src-tauri/src/claude_sessions/mod.rs.
export const CLAUDE_SESSIONS_CHANGED_EVENT = "claude-sessions-changed";

/** Reads claude-sessions' state directory (`~/.claude/session-status/state`) now. */
export function getClaudeSessions() {
  return invoke<ClaudeSessionsSnapshot>("get_claude_sessions");
}

/** Calls `handler` with each changed snapshot while the native watcher runs. */
export function listenClaudeSessions(handler: (snapshot: ClaudeSessionsSnapshot) => void): Promise<UnlistenFn> {
  return listen<ClaudeSessionsSnapshot>(CLAUDE_SESSIONS_CHANGED_EVENT, ({ payload }) => handler(payload));
}
