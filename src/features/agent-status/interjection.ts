import { detectAlerts, type AgentAlertKinds, type SessionPhases } from "./alerts.ts";
import type { AgentSessionSummary } from "./api";
import { sessionName } from "./session.ts";

/**
 * While the collapsed island shows lyrics, how long an agent whose session just changed takes
 * their place.
 */
export const AGENT_INTERJECTION_MS = 4000;

/**
 * The changes worth interrupting the lyrics for: a new session starting, a turn finishing
 * (including one whose reply ends on "your turn"), a failure, a question or approval. A later turn
 * starting is left out (the user just typed it).
 */
const INTERJECTING: AgentAlertKinds = { started: "newSession", completed: true, failed: true, waiting: true };

const named = (session: AgentSessionSummary) => sessionName(session).title !== "";
const latest = (sessions: AgentSessionSummary[]) =>
  sessions.reduce<AgentSessionSummary | null>((found, session) => (!found || session.updatedAt > found.updatedAt ? session : found), null);

/** The session that changed since `previous` and should be shown for a moment; the latest when several did. */
export function interjectingSession(previous: SessionPhases | null, sessions: AgentSessionSummary[]): AgentSessionSummary | null {
  return latest(detectAlerts(previous, sessions, INTERJECTING).map((alert) => alert.session).filter(named));
}

/**
 * The session stopped mid-turn on an approval or a question, which keeps the bar until answered;
 * the latest when several are. A finished turn whose reply asks something is not held: it may
 * wait for hours, and the session light already shows it.
 */
export function waitingSession(sessions: AgentSessionSummary[]): AgentSessionSummary | null {
  return latest(sessions.filter((session) => session.phase === "waiting" && named(session)));
}
