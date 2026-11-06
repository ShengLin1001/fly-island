import type { ClaudeSessionsText } from "../../i18n/sections/claudeSessions";
import type { ClaudeSession, ClaudeSessionCounts, ClaudeSessionsSnapshot } from "./api";

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
export function sessionRingSummary(snapshot: ClaudeSessionsSnapshot | null, text: ClaudeSessionsText): string {
  if (!snapshot?.detected) return text.notDetected;
  const parts = SESSION_RING_STATES.filter(({ key }) => snapshot.counts[key] > 0).map(
    ({ key }) => `${text[key]} ${snapshot.counts[key]}`,
  );
  return parts.length > 0 ? parts.join(" · ") : text.empty;
}

/** How many sessions waiting on you the hover card names. */
const CARD_SESSIONS = 3;
/** Longer titles are cut to this many characters plus an ellipsis. */
const CARD_TITLE_LENGTH = 40;

/** The last folder of a working directory: "fly-island" for `F:\code\fly-island\`. */
function folderName(cwd: string) {
  return cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

/** "标题 · 项目", the title cut to CARD_TITLE_LENGTH; the id's first 8 characters if both are empty. */
function sessionName({ title, cwd, sessionId }: ClaudeSession) {
  const chars = [...title];
  const short = chars.length > CARD_TITLE_LENGTH ? `${chars.slice(0, CARD_TITLE_LENGTH).join("")}…` : title;
  return [short, folderName(cwd)].filter(Boolean).join(" · ") || sessionId.slice(0, 8);
}

/**
 * The ring's hover card: the summary, then up to three sessions waiting on you (needs approval
 * first, as the list is sorted), each "等授权：标题 · 项目".
 */
export function sessionRingCardLines(snapshot: ClaudeSessionsSnapshot | null, text: ClaudeSessionsText): string[] {
  const waiting = (snapshot?.detected ? snapshot.sessions : [])
    .flatMap((session) => (session.state === "needs" || session.state === "yourturn"
      ? [text.sessionLine(text[session.state], sessionName(session))]
      : []))
    .slice(0, CARD_SESSIONS);
  return [sessionRingSummary(snapshot, text), ...waiting];
}

/** Same counts and sessions, so a re-sent snapshot does not re-render the ring. */
export function sameClaudeSessions(a: ClaudeSessionsSnapshot | null, b: ClaudeSessionsSnapshot) {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
