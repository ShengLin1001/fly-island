import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import type { AgentHostDisplay } from "../appearance/types";
import { AgentUsageBar } from "./AgentUsageBar";
import type { AgentUsages } from "./usage";
import { focusAgentWindow, type AgentSessionSummary } from "./api";
import { groupByComputer, isActivePhase } from "./sessionList";
import { AgentSessionCard } from "./AgentSessionCard";
import { AgentSessionsFooter } from "./AgentSessionsFooter";
import { useScrollFade } from "./useScrollFade";
import { sessionKey } from "./unseen";
import type { UnseenSessions } from "./useUnseenSessions";
import type { SessionRemoval } from "./useHiddenSessions";
import type { AlertedSession } from "./useAgentAlerts";
import { AgentApprovalCard } from "./approvals/AgentApprovalCard";
import { AgentQuestionCard } from "./approvals/AgentQuestionCard";
import type { AgentApprovals } from "./approvals/useAgentApprovals";
import "./AgentSessionsPanel.css";

const NOT_FOUND_NOTICE_MS = 3000;
const AGE_REFRESH_MS = 30_000;

/**
 * The island's Agent page: recent sessions as cards (AgentSessionCard), grouped by computer once
 * another one is listed, with a count of each state below; clicking a card brings its editor or
 * terminal forward. On an alert's card a finished or failed session shows up to three lines of
 * its reply.
 */
export function AgentSessionsPanel({
  sessions: listed,
  hostDisplay,
  showElapsed = true,
  showModel = true,
  showActivity = true,
  unseen,
  removal,
  reveal,
  showUsage: usageOn = false,
  usages,
  approvals,
}: {
  sessions: AgentSessionSummary[];
  /** How the program a session runs in is shown; "off" hides it. */
  hostDisplay: AgentHostDisplay;
  showElapsed?: boolean;
  showModel?: boolean;
  /** The latest prompt and the tool in use, on working rows. */
  showActivity?: boolean;
  /** Finished sessions not looked at yet; they stand out until clicked. */
  unseen?: UnseenSessions;
  /** Removing a session from the page (an x at a row's right end), and undoing it. */
  removal?: SessionRemoval;
  /** The session an alert opened the page for; the page then shows it alone, like a card. */
  reveal?: AlertedSession | null;
  /** Claude's and Codex's usage limits above the list. */
  showUsage?: boolean;
  /** Those limits as the island read them; without them the usage lines read their own. */
  usages?: AgentUsages;
  /** Permission requests agents wait on; the page shows the first one alone. */
  approvals?: AgentApprovals;
}) {
  const t = useTranslation();
  // An alert's session alone, kept current from the list; the list may leave it out (only
  // running sessions listed), and then it shows as the alert saw it.
  const sessions = reveal ? [listed.find((session) => sessionKey(session) === reveal.key) ?? reveal.session] : listed;
  const showUsage = usageOn && !reveal;
  const [now, setNow] = useState(() => Date.now());
  const [notFoundId, setNotFoundId] = useState<string | null>(null);
  // Fade out an end of the list that has more sessions past it, rather than cutting a row in half.
  const list = useScrollFade<HTMLUListElement>(sessions);
  const cardRef = useRef<HTMLLIElement>(null);
  const measure = reveal?.measure;
  const cardKey = reveal?.key;

  // The island fits the card: report its row's height now and whenever it changes (a new reply).
  useLayoutEffect(() => {
    const row = cardRef.current;
    if (!measure || !row) return;
    const report = () => measure(row.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, cardKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notFoundId) return;
    const timer = window.setTimeout(() => setNotFoundId(null), NOT_FOUND_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notFoundId]);

  const focus = (session: AgentSessionSummary) => {
    setNotFoundId(null);
    unseen?.markSeen(session);
    // A session on another computer has no window here; the row says where it runs instead.
    if (session.remoteHost) {
      setNotFoundId(session.sessionId);
      return;
    }
    void focusAgentWindow(session.provider, session.cwd, session.title, session.sessionId)
      .then((found) => {
        if (!found) setNotFoundId(session.sessionId);
      })
      .catch((error) => {
        console.error("Failed to focus the agent window", error);
        setNotFoundId(session.sessionId);
      });
  };

  // A request an agent is waiting on comes before everything else on the page.
  if (approvals?.current) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        {approvals.current.kind === "question" ? (
          <AgentQuestionCard approvals={approvals} sessions={listed} />
        ) : (
          <AgentApprovalCard approvals={approvals} sessions={listed} />
        )}
      </section>
    );
  }

  const removedNotice = removal?.removed && !reveal && (
    <div className="agent-sessions__removed" role="status">
      <span>{t.agent.sessions.removed}</span>
      <button type="button" onClick={removal.undo}>{t.agent.sessions.undo}</button>
    </div>
  );

  if (sessions.length === 0) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        {showUsage && <AgentUsageBar usages={usages} />}
        <div className="agent-sessions__empty">
          <strong>{t.agent.sessions.empty}</strong>
          <span>{t.agent.sessions.emptyHint}</span>
        </div>
        {removedNotice}
      </section>
    );
  }

  return (
    <section className="agent-sessions" aria-label={t.agent.sessions.title}>
      {showUsage && <AgentUsageBar usages={usages} />}
      <ul
        ref={list.ref}
        className="agent-sessions__list"
        data-fade-top={list.fade.top || undefined}
        data-fade-bottom={list.fade.bottom || undefined}
        onScroll={list.onScroll}
      >
        {groupByComputer(sessions).flatMap(({ host, sessions: members }, _, groups) => [
          // Headings only once another computer is listed (never on an alert's card).
          !reveal && (groups.length > 1 || host !== null) ? (
            <li key={`computer:${host ?? ""}`} className="agent-sessions__computer" aria-hidden="true">
              {host ?? t.agent.sessions.thisComputer}
            </li>
          ) : null,
          ...members.map((session) => (
            <AgentSessionCard
              key={`${session.provider}:${session.sessionId}`}
              session={session}
              now={now}
              hostDisplay={hostDisplay}
              showElapsed={showElapsed}
              showModel={showModel}
              showActivity={showActivity}
              unseen={Boolean(unseen?.keys.has(sessionKey(session)))}
              notFound={notFoundId === session.sessionId}
              // On an alert's card a finished or failed session shows its last reply (its summary).
              cardReply={reveal && !isActivePhase(session.phase) ? session.lastMessage : null}
              cardRef={reveal ? cardRef : undefined}
              onOpen={() => focus(session)}
              onRemove={removal && !reveal ? () => removal.remove(session) : undefined}
            />
          )),
        ])}
      </ul>
      {!reveal && <AgentSessionsFooter sessions={sessions} />}
      {removedNotice}
    </section>
  );
}
