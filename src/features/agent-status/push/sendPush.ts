import { sendCcConnectMessage } from "../../cc-connect/api";
import type { AgentAlert, AgentAlertKind } from "../alerts";
import { sessionProject } from "../sessionList";
import { AGENT_PROVIDER_LABELS } from "../status";
import { getAgentPushDetail, getUserIdleSeconds, isSessionLocked, NO_PUSH_DETAIL, sendBarkPush } from "./api";
import { ccConnectText, pushBody, takeoverCommands } from "./pushText";
import type { AgentPushSettings } from "./storage";

/** Groups the pushes on the phone. */
export const PUSH_GROUP = "FocuSD Island";

export type PushLabels = {
  kinds: Record<Exclude<AgentAlertKind, "started">, (agent: string) => string>;
  /** Leads the takeover commands in a cc-connect push. */
  takeover: string;
};

/** Away: the screen is locked, or no keyboard or mouse input for `minutes`; with 0, always. */
export async function isAway(minutes: number) {
  if (minutes === 0) return true;
  const [locked, idle] = await Promise.all([isSessionLocked().catch(() => false), getUserIdleSeconds().catch(() => null)]);
  // Unknown idle time counts as away: better a push too many than one missed while away.
  return locked || idle === null || idle >= minutes * 60;
}

/**
 * Sends one alert to the phone. Bark gets the session's name and what happened, never a command
 * or a reply. A cc-connect chat is the user's own bot, so it gets what the session waits on and the
 * commands to take it over there. `ccConnectPath`: the cc-connect plugin's program setting, null
 * while that plugin is off.
 */
export async function sendPush({ kind, session }: AgentAlert, push: AgentPushSettings, labels: PushLabels, ccConnectPath: string | null) {
  if (kind === "started") return;
  const agent = AGENT_PROVIDER_LABELS[session.provider];
  const title = session.title ?? sessionProject(session.cwd) ?? agent;
  if (push.channel === "bark") return sendBarkPush(push.server, title, labels.kinds[kind](agent), PUSH_GROUP);

  if (ccConnectPath === null) throw new Error("The cc-connect plugin is off.");
  const detail = await getAgentPushDetail(session.provider, session.sessionId, session.remoteHost ?? null).catch(() => NO_PUSH_DETAIL);
  // A session cc-connect runs itself (`claude -p`): the phone already shows it.
  if (detail.entrypoint === "sdk-cli") return;
  const heading = `${session.remoteHost ? `${session.remoteHost} · ` : ""}${title} · ${labels.kinds[kind](agent)}`;
  const body = pushBody({ kind, session }, detail);
  const commands = takeoverCommands(session, detail);
  const { project, chats } = push.ccConnect;
  const results = await Promise.allSettled(
    chats.map((key) => sendCcConnectMessage(ccConnectPath, project, key, ccConnectText(heading, body, commands, labels.takeover, key.split(":")[0]))),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}
