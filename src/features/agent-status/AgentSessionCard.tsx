import type { Ref } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { AgentHostDisplay } from "../appearance/types";
import { AgentProviderIcon } from "./AgentProviderIcon";
import type { AgentSessionSummary } from "./api";
import { formatTokens, isActivePhase, minutesAgo, modelLabel, sessionProject } from "./sessionList";
import { SessionElapsed } from "./SessionElapsed";
import { SessionHostLabel } from "./SessionHostLabel";
import { sessionLight, type SessionLight } from "./sessionLight";
import { AGENT_PROVIDER_LABELS, getAgentPhaseLabel } from "./status";
import { sessionKey } from "./unseen";
import "./AgentSessionCard.css";

/** Lights whose frame is drawn in their colour (and breathes with effects on): working or waiting on the user. */
const LIVELY: ReadonlySet<SessionLight> = new Set(["needs", "yourTurn", "working"]);

export type AgentSessionCardProps = {
  session: AgentSessionSummary;
  now: number;
  hostDisplay: AgentHostDisplay;
  showElapsed: boolean;
  showModel: boolean;
  showActivity: boolean;
  /** Glow, a breathing frame on lively cards and the sparkle band (Settings, off by default). */
  effects: boolean;
  unseen: boolean;
  /** What a click found no window for: says so (or where a remote session runs) for a moment. */
  notFound: boolean;
  /** On an alert's card, a finished or failed session's last reply, shown in full below. */
  cardReply: string | null;
  cardRef?: Ref<HTMLLIElement>;
  onOpen: () => void;
  onRemove?: () => void;
};

/**
 * One session on the Agent page as a card framed in its light's colour: the title with model,
 * effort and time on the first line; the state and what it is doing, with the context size, on
 * the second. With effects on, every card glows and carries a drifting sparkle band, and working
 * sessions and those waiting on the user breathe.
 */
export function AgentSessionCard({ session, now, hostDisplay, showElapsed, showModel, showActivity, effects, unseen, notFound, cardReply, cardRef, onOpen, onRemove }: AgentSessionCardProps) {
  const t = useTranslation();
  const project = sessionProject(session.cwd);
  const title = session.title ?? project ?? AGENT_PROVIDER_LABELS[session.provider];
  const model = showModel ? modelLabel(session.model, session.effort) : null;
  const mode = session.permissionMode && session.permissionMode !== "default" ? t.agent.sessions.permissionModes[session.permissionMode] : null;
  const light = sessionLight(session);
  const active = isActivePhase(session.phase);
  const minutes = minutesAgo(session.updatedAt, now);
  const age = minutes === 0 ? t.agent.sessions.justNow : t.agent.sessions.minutesAgo(minutes);
  const time = showElapsed && session.turnStartedAt !== null && session.phase === "running" ? <SessionElapsed session={session} compact /> : age;

  const state = session.compacting
    ? t.agent.sessions.compacting
    : light === "needs"
      ? t.sessionRing.needs
      : light === "yourTurn"
        ? t.sessionRing.yourturn
        : getAgentPhaseLabel(session.phase, t);
  const tool = showActivity && active ? session.currentTool : null;
  const prompt = showActivity && active ? session.lastPrompt : null;
  // What it is doing: the tool it calls, else its latest reply, else the prompt it works on.
  const doing = cardReply ? null : tool ? (
    <span className="agent-session__tool">
      <span className="agent-session__tool-name">{tool.name}</span>
      {tool.detail && <span className="agent-session__tool-detail">{tool.detail}</span>}
    </span>
  ) : session.lastMessage ? (
    <span className="agent-session__message">{session.lastMessage}</span>
  ) : prompt ? (
    <span className="agent-session__prompt">{t.agent.sessions.yourPrompt(prompt)}</span>
  ) : null;
  const subagents = active && session.subagents ? t.agent.sessions.subagents(session.subagents) : null;

  return (
    <li ref={cardRef} data-session-key={sessionKey(session)}>
      <button
        className={`agent-session agent-session--${session.phase} agent-session--light-${light}${unseen ? " agent-session--unseen" : ""}${LIVELY.has(light) ? " agent-session--lively" : ""}${effects ? " agent-session--effects" : ""}`}
        type="button"
        onClick={onOpen}
      >
        {effects && <span className="agent-session__band" aria-hidden="true" />}
        <span className="agent-session__heading">
          <span className="agent-session__title">
            {project && project !== title ? <span className="agent-session__project">{project} · </span> : null}
            {title}
          </span>
          {notFound ? (
            <span className="agent-session__not-found" role="status">
              {session.remoteHost ? t.agent.sessions.remoteOnly(session.remoteHost) : active ? t.agent.sessions.notFound : t.agent.sessions.notFoundEnded}
            </span>
          ) : (
            <span className="agent-session__meta">
              {mode && <span className={`agent-session__mode agent-session__mode--${session.permissionMode}`}>{mode}</span>}
              {model && <span className="agent-session__model">{model}</span>}
              {model && <span className="agent-session__divider" aria-hidden="true" />}
              <span className="agent-session__time">{time}</span>
            </span>
          )}
          {session.host && hostDisplay !== "off" && <SessionHostLabel host={session.host} display={hostDisplay} />}
          <AgentProviderIcon provider={session.provider} size={14} />
        </span>
        <span className="agent-session__status-line">
          <span className="agent-session__status">
            <span className="agent-session__state">{state}</span>
            {subagents && <span className="agent-session__subagents">{subagents}</span>}
            {doing}
          </span>
          {session.contextTokens ? <span className="agent-session__tokens">{formatTokens(session.contextTokens)} tokens</span> : null}
        </span>
        {cardReply && <span className="agent-session__message agent-session__message--card">{cardReply}</span>}
      </button>
      {/* Over the card's right end, shown only while the cursor is there: some sessions never
          report that they ended and would otherwise stay listed as running. */}
      {onRemove && (
        <button className="agent-session__remove" type="button" aria-label={t.agent.sessions.remove(title)} onClick={onRemove}>
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
