import type { ClaudeSessionsText } from "../../i18n/sections/claudeSessions";
import type { ClaudeSessionCounts, ClaudeSessionsSnapshot } from "./api";

export type RingSegment = { value: number; color: string };

type CountKey = Exclude<keyof ClaudeSessionCounts, "total">;

/** Ring order and colors (claude-sessions' palette); stale is a dimmed running green. */
export const SESSION_RING_STATES: readonly { key: CountKey; color: string }[] = [
  { key: "needs", color: "#FF453A" },
  { key: "yourturn", color: "#FFD60A" },
  { key: "working", color: "#34C759" },
  { key: "stale", color: "rgba(52, 199, 89, 0.45)" },
  { key: "done", color: "#8E8E93" },
];

/** One segment per state that has sessions, in priority order. */
export function sessionRingSegments(counts: ClaudeSessionCounts): RingSegment[] {
  return SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key, color }) => ({ value: counts[key], color }));
}

/** "等授权 1 · 等你回复 2 · 运行 3 · 完成 1", listing only states that have sessions. */
export function sessionRingTooltip(snapshot: ClaudeSessionsSnapshot | null, text: ClaudeSessionsText): string {
  if (!snapshot?.detected) return text.notDetected;
  const parts = SESSION_RING_STATES.filter(({ key }) => snapshot.counts[key] > 0).map(
    ({ key }) => `${text[key]} ${snapshot.counts[key]}`,
  );
  return parts.length > 0 ? parts.join(" · ") : text.empty;
}

/** Same counts and sessions, so a re-sent snapshot does not re-render the ring. */
export function sameClaudeSessions(a: ClaudeSessionsSnapshot | null, b: ClaudeSessionsSnapshot) {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
