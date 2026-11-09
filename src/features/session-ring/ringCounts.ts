import type { AgentSessionSummary } from "../agent-status/api";
import { sessionProject } from "../agent-status/sessionList.ts";
import { sessionKey } from "../agent-status/unseen.ts";
import { sessionLight } from "../agent-status/sessionLight.ts";
import type { SessionRingText } from "../../i18n/sections/sessionRing";

export type RingSegment = { value: number; color: string };

export type SessionRingState = "needs" | "yourturn" | "working" | "stale" | "done";

export type SessionRingCounts = Record<SessionRingState, number> & { total: number };

/** Ring order and colours, from 12 o'clock; stale is a dimmed running green. */
export const SESSION_RING_STATES: readonly { key: SessionRingState; color: string }[] = [
  { key: "needs", color: "#FF453A" },
  { key: "yourturn", color: "#FFD60A" },
  { key: "working", color: "#34C759" },
  { key: "stale", color: "rgba(52, 199, 89, 0.45)" },
  { key: "done", color: "#8E8E93" },
];

/**
 * Where a session sits on the ring: its light on the Agent page (agent-status/sessionLight.ts).
 * Waiting on the user mid-turn is red, and so is a failed turn; a finished turn that asks
 * something is yellow; running is green, silent mid-turn dim green, done grey. Once the user has
 * looked at a session that waits or failed (clicked it, or had its window in front), it stops
 * asking (roadmap B15) and is grey, as its row on the page is ("looked").
 */
export function sessionRingState(session: AgentSessionSummary, unseen: ReadonlySet<string>): SessionRingState {
  const light = sessionLight(session);
  if (!unseen.has(sessionKey(session)) && (light === "needs" || light === "yourTurn" || light === "failed")) return "done";
  switch (light) {
    case "needs":
    case "failed":
      return "needs";
    case "yourTurn":
      return "yourturn";
    case "working":
      return "working";
    case "stale":
      return "stale";
    case "done":
      return "done";
  }
}

/**
 * Counts by state of the sessions the Agent page lists; the caller passes that list, so the ring
 * holds exactly the page's sessions and leaves as they leave it (hidden, quit or removed).
 */
export function sessionRingCounts(sessions: readonly AgentSessionSummary[], unseen: ReadonlySet<string>): SessionRingCounts {
  const counts: SessionRingCounts = { needs: 0, yourturn: 0, working: 0, stale: 0, done: 0, total: 0 };
  for (const session of sessions) {
    counts[sessionRingState(session, unseen)] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Most cells the pixel grid shows (3 × 3). */
export const SESSION_GRID_MAX = 9;

/** A pixel grid cell: one session's state, or "more" for the sessions past the ninth. */
export type SessionGridCell = SessionRingState | "more";

/**
 * The pixel grid's lit cells, one state per session in ring order (the ones waiting on you
 * first). Past SESSION_GRID_MAX sessions the last cell says "more" and the least urgent are left
 * off; the hover card still counts them all.
 */
export function sessionGridCells(counts: SessionRingCounts): SessionGridCell[] {
  const cells: SessionGridCell[] = SESSION_RING_STATES.flatMap(({ key }) => Array<SessionRingState>(counts[key]).fill(key));
  return cells.length > SESSION_GRID_MAX ? [...cells.slice(0, SESSION_GRID_MAX - 1), "more"] : cells;
}

/** Most bars a signal column holds; the hover card still counts them all. */
export const SESSION_SIGNAL_MAX = 7;

/** A signal column: its colour's state and one bar per session, bottom first. */
export type SessionSignalColumn = { key: SessionRingState; bars: SessionRingState[] };

/** Signal columns from left to right, least urgent first; silent running sessions sit dimmed on the green one. */
const SIGNAL_COLUMNS: readonly SessionRingState[][] = [["done"], ["working", "stale"], ["yourturn"], ["needs"]];

/**
 * The signal style's columns: one per colour that has sessions (a colour with none has no column),
 * one lit bar per session, up to SESSION_SIGNAL_MAX. Every column has `slots` bars, five or as
 * many as the tallest needs, the unlit ones dim, so the columns keep one height and the lit part
 * reads as the count. Bars are 3px with five slots, 2px past that.
 */
export function sessionSignal(counts: SessionRingCounts): { columns: SessionSignalColumn[]; slots: number; bar: 2 | 3 } {
  const columns = SIGNAL_COLUMNS.map((states) => ({
    key: states[0],
    bars: states.flatMap((state) => Array<SessionRingState>(counts[state]).fill(state)).slice(0, SESSION_SIGNAL_MAX),
  })).filter(({ bars }) => bars.length > 0);
  const tallest = Math.max(0, ...columns.map(({ bars }) => bars.length));
  const slots = Math.max(5, tallest);
  return { columns, slots, bar: slots === 5 ? 3 : 2 };
}

/** One segment per state that has sessions, in ring order. */
export function sessionRingSegments(counts: SessionRingCounts): RingSegment[] {
  return SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key, color }) => ({ value: counts[key], color }));
}

/** "等你确认 1 · 等你回复 2 · 运行 3 · 完成 1", listing only states that have sessions. */
export function sessionRingSummary(counts: SessionRingCounts, text: SessionRingText): string {
  const parts = SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key }) => `${text[key]} ${counts[key]}`);
  return parts.length > 0 ? parts.join(" · ") : text.empty;
}

/** How many sessions waiting on you the hover card names. */
const CARD_SESSIONS = 3;
/** Longer titles are cut to this many characters plus an ellipsis. */
const CARD_TITLE_LENGTH = 40;

/** "标题 · 项目", the title cut to CARD_TITLE_LENGTH; the id's first 8 characters if both are empty. */
function sessionName({ title, cwd, sessionId }: AgentSessionSummary) {
  const chars = [...(title ?? "")];
  const short = chars.length > CARD_TITLE_LENGTH ? `${chars.slice(0, CARD_TITLE_LENGTH).join("")}…` : chars.join("");
  return [short, sessionProject(cwd)].filter(Boolean).join(" · ") || sessionId.slice(0, 8);
}

/**
 * The ring's hover card: the summary, then up to three sessions waiting on you, the ones that
 * need approval or an answer first, each "等你确认：标题 · 项目".
 */
export function sessionRingCardLines(
  sessions: readonly AgentSessionSummary[],
  unseen: ReadonlySet<string>,
  text: SessionRingText,
): string[] {
  const states = sessions.map((session) => ({ session, state: sessionRingState(session, unseen) }));
  const waiting = (["needs", "yourturn"] as const)
    .flatMap((key) => states.filter(({ state }) => state === key).map(({ session }) => text.sessionLine(text[key], sessionName(session))))
    .slice(0, CARD_SESSIONS);
  return [sessionRingSummary(sessionRingCounts(sessions, unseen), text), ...waiting];
}
