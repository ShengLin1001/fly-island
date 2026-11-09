import { readJson, writeJson } from "../../../lib/storage.ts";

export const AGENT_PUSH_STORAGE_KEY = "focusd-island-agent-push";

/** What a session did that can go to the phone. */
export const AGENT_PUSH_EVENTS = ["waiting", "completed", "failed"] as const;
export type AgentPushEvent = (typeof AGENT_PUSH_EVENTS)[number];

/** Push only after this many minutes without keyboard or mouse input (or at once when locked); 0 pushes always. */
export const AGENT_PUSH_AWAY_MINUTES = [0, 2, 5, 10] as const;

/** Where a push goes: Bark, or a chat of a cc-connect bot (the built-in plugin focusd.cc-connect). */
export const AGENT_PUSH_CHANNELS = ["bark", "ccConnect"] as const;
export type AgentPushChannel = (typeof AGENT_PUSH_CHANNELS)[number];

/** The cc-connect project to send through, and the keys of its chats that get the push. */
export type CcConnectPushTarget = { project: string; chats: string[] };

const MAX_CHATS = 20;

export type AgentPushSettings = {
  enabled: boolean;
  /** A bark-server's address; empty is Bark's own (https://api.day.app). */
  server: string;
  events: Record<AgentPushEvent, boolean>;
  awayMinutes: number;
  channel: AgentPushChannel;
  ccConnect: CcConnectPushTarget;
};

export const DEFAULT_AGENT_PUSH_SETTINGS: AgentPushSettings = {
  enabled: false,
  server: "",
  events: { waiting: true, completed: true, failed: true },
  // Pushing to the phone while sitting at the computer is noise.
  awayMinutes: 5,
  channel: "bark",
  ccConnect: { project: "", chats: [] },
};

export function normalizeAgentPushSettings(value: unknown): AgentPushSettings {
  const fallback = DEFAULT_AGENT_PUSH_SETTINGS;
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const rawEvents = raw.events && typeof raw.events === "object" ? (raw.events as Record<string, unknown>) : {};
  const bool = (input: unknown, otherwise: boolean) => (typeof input === "boolean" ? input : otherwise);
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    server: typeof raw.server === "string" ? raw.server.trim().slice(0, 200) : fallback.server,
    events: Object.fromEntries(AGENT_PUSH_EVENTS.map((event) => [event, bool(rawEvents[event], fallback.events[event])])) as Record<AgentPushEvent, boolean>,
    awayMinutes: (AGENT_PUSH_AWAY_MINUTES as readonly unknown[]).includes(raw.awayMinutes) ? (raw.awayMinutes as number) : fallback.awayMinutes,
    channel: (AGENT_PUSH_CHANNELS as readonly unknown[]).includes(raw.channel) ? (raw.channel as AgentPushChannel) : fallback.channel,
    ccConnect: normalizeTarget(raw.ccConnect),
  };
}

export function loadAgentPushSettings(): AgentPushSettings {
  return normalizeAgentPushSettings(readJson(AGENT_PUSH_STORAGE_KEY));
}

export function saveAgentPushSettings(settings: AgentPushSettings) {
  writeJson(AGENT_PUSH_STORAGE_KEY, settings);
}

function normalizeTarget(value: unknown): CcConnectPushTarget {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const project = typeof raw.project === "string" ? raw.project.trim().slice(0, 200) : "";
  // A chat key is `<platform>:<chat>:<user>`; anything else would only fail to send.
  const chats = Array.isArray(raw.chats)
    ? [...new Set(raw.chats.filter((chat): chat is string => typeof chat === "string" && chat.includes(":") && chat.length <= 256))].slice(0, MAX_CHATS)
    : [];
  return { project, chats };
}
