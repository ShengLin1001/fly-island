import { useTranslation } from "../../i18n";
import type { AgentSessionSummary } from "./api";
import { sessionLight, type SessionLight } from "./sessionLight";

/** The footer's order; failed counts with "needs you", as on the session ring. */
const ORDER: readonly SessionLight[] = ["needs", "yourTurn", "working", "stale", "done"];

/** Under the Agent page's cards: how many sessions, then how many in each light that has any. */
export function AgentSessionsFooter({ sessions }: { sessions: readonly AgentSessionSummary[] }) {
  const t = useTranslation();
  const counts = new Map<SessionLight, number>();
  for (const session of sessions) {
    const light = sessionLight(session);
    const key = light === "failed" ? "needs" : light;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labels: Record<string, string> = {
    needs: t.sessionRing.needs,
    yourTurn: t.sessionRing.yourturn,
    working: t.sessionRing.working,
    stale: t.sessionRing.stale,
    done: t.sessionRing.done,
  };
  const parts = ORDER.filter((light) => counts.get(light)).map((light) => (
    <span key={light} className={`agent-sessions__count agent-sessions__count--${light}`}>
      {counts.get(light)} {labels[light]}
    </span>
  ));

  return (
    <div className="agent-sessions__footer">
      <span>{t.agent.sessions.total(sessions.length)}</span>
      <span className="agent-sessions__counts">{parts}</span>
    </div>
  );
}
