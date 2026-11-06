import { MiniRing } from "../../components/MiniRing";
import { useTranslation } from "../../i18n";
import type { ClaudeSessionsSnapshot } from "./api";
import { sessionRingSegments, sessionRingSummary } from "./sessionRing.ts";
import "./ClaudeSessionRing.css";

/** Outer size of the ring in px; the collapsed bar reserves this plus a gap. */
export const SESSION_RING_SIZE = 20;

type ClaudeSessionRingProps = {
  snapshot: ClaudeSessionsSnapshot;
  /** Opens the Agent page; without it the ring only shows. */
  onOpen?: () => void;
};

/** claude-sessions' sessions as one segmented ring on the collapsed bar, the count in the middle. */
export function ClaudeSessionRing({ snapshot, onOpen }: ClaudeSessionRingProps) {
  const t = useTranslation();
  const summary = sessionRingSummary(snapshot, t.claudeSessions);
  const ring = (
    <MiniRing
      segments={sessionRingSegments(snapshot.counts)}
      size={SESSION_RING_SIZE}
      label={String(snapshot.counts.total)}
      ariaLabel={summary}
    />
  );
  if (!onOpen) return <span className="claude-session-ring">{ring}</span>;
  return (
    <button
      className="claude-session-ring claude-session-ring--button"
      type="button"
      aria-label={t.claudeSessions.openAgents(summary)}
      onClick={(event) => {
        // The bar itself opens the island on a click; this one goes to the Agent page.
        event.stopPropagation();
        onOpen();
      }}
    >
      {ring}
    </button>
  );
}
