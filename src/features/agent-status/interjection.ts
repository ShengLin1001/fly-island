import { detectAlerts, isWaitingOnUser, type AgentAlertKinds, type SessionPhases } from "./alerts.ts";
import type { AgentSessionSummary } from "./api";
import { sessionName } from "./session.ts";

/**
 * While the collapsed island shows lyrics, how long an agent whose session just changed takes
 * their place.
 */
export const AGENT_INTERJECTION_MS = 4000;

/**
 * The changes worth interrupting the lyrics for: a new session starting, a turn finishing, a
 * failure. A later turn starting is left out (the user just typed it), and waiting on the user is
 * not a moment but a state, held by `waitingSession` until answered.
 */
const INTERJECTING: AgentAlertKinds = { started: "newSession", completed: true, failed: true, waiting: false };

const named = (session: AgentSessionSummary) => sessionName(session).title !== "";
const latest = (sessions: AgentSessionSummary[]) =>
  sessions.reduce<AgentSessionSummary | null>((found, session) => (!found || session.updatedAt > found.updatedAt ? session : found), null);

/** The session that changed since `previous` and should be shown for a moment; the latest when several did. */
export function interjectingSession(previous: SessionPhases | null, sessions: AgentSessionSummary[]): AgentSessionSummary | null {
  return latest(detectAlerts(previous, sessions, INTERJECTING).map((alert) => alert.session).filter(named));
}

/** The session waiting on the user, which keeps the bar until answered; the latest when several do. */
export function waitingSession(sessions: AgentSessionSummary[]): AgentSessionSummary | null {
  return latest(sessions.filter((session) => isWaitingOnUser(session) && named(session)));
}
