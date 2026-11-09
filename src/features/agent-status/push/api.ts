import { invoke } from "@tauri-apps/api/core";

// Mirrors the commands in src-tauri/src/phone_push/mod.rs (roadmap B6.5.5), and get_agent_push_detail in agent_status.

export function hasBarkKey() {
  return invoke<boolean>("has_bark_key");
}

/** Takes the bare key or the push URL the Bark app shows; kept in Windows Credential Manager. */
export function saveBarkKey(key: string) {
  return invoke<void>("save_bark_key", { key });
}

export function deleteBarkKey() {
  return invoke<void>("delete_bark_key");
}

/** `server` empty means Bark's own server. */
export function sendBarkPush(server: string, title: string, body: string, group: string) {
  return invoke<void>("send_bark_push", { server, title, body, group });
}

/** Seconds since the last keyboard or mouse input; null when Windows cannot say. */
export function getUserIdleSeconds() {
  return invoke<number | null>("get_user_idle_seconds");
}

/** Whether the screen is locked now; locked counts as away at once. */
export function isSessionLocked() {
  return invoke<boolean>("is_session_locked");
}

/** Mirrors PushDetail in src-tauri/src/agent_status/push_detail.rs. */
export type AgentPushDetail = {
  /** How the session was started: "cli" (a terminal), "sdk-cli" (`claude -p`, as cc-connect runs it), "sdk-ts" (an Agent SDK host). */
  entrypoint: string | null;
  /** What it waits on: its open question, its plan, or its last reply. */
  wait: { kind: "question" | "plan" | "reply"; text: string } | null;
};

export const NO_PUSH_DETAIL: AgentPushDetail = { entrypoint: null, wait: null };

/** Read from the session's transcript (for a session on an SSH computer, from the island's copy). */
export function getAgentPushDetail(provider: string, sessionId: string, remoteHost: string | null) {
  return invoke<AgentPushDetail>("get_agent_push_detail", { provider, sessionId, remoteHost });
}
