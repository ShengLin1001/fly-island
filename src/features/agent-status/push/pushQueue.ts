import type { AgentAlert } from "../alerts";
import type { AgentSessionSummary } from "../api";
import { rememberedPhase } from "../sessionLight.ts";
import { sessionKey } from "../unseen.ts";

/** More than this many due at once (the island just woke up, say) is noise; the newest go. */
export const MAX_PUSHES = 3;

type Pending = AgentAlert & { phase: AgentSessionSummary["phase"] };

/**
 * Alerts not pushed yet, one per session (a newer alert replaces an older one), each with the
 * phase its session was in when it came, in the order they came.
 */
export type PushQueue = Map<string, Pending>;

export function queuePushes(queue: PushQueue, alerts: AgentAlert[]) {
  for (const alert of alerts) {
    const key = sessionKey(alert.session);
    queue.delete(key);
    queue.set(key, { ...alert, phase: rememberedPhase(alert.session) });
  }
}

/**
 * The alerts to push now. One whose session has moved on (answered, running again, gone from the
 * list) or that the user has looked at (roadmap B15) is dropped: it was dealt with at the computer.
 * The rest wait until the user is `away` (screen locked, or idle long enough), so a wait that
 * began while the user sat there is still pushed once they leave; then they go, each once.
 */
export function takeDuePushes(
  queue: PushQueue,
  sessions: AgentSessionSummary[],
  away: boolean,
  looked: (session: AgentSessionSummary) => boolean,
): AgentAlert[] {
  const current = new Map(sessions.map((session) => [sessionKey(session), session]));
  for (const [key, pending] of queue) {
    const session = current.get(key);
    if (!session || rememberedPhase(session) !== pending.phase || looked(session)) queue.delete(key);
  }
  if (!away) return [];
  const due = [...queue.entries()].map(([key, { kind, session }]) => ({ kind, session: current.get(key) ?? session }));
  queue.clear();
  return due.slice(-MAX_PUSHES);
}
