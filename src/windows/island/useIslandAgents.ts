import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useAgentInterjection } from "../../features/agent-status/useAgentInterjection";
import { useIslandAgentSessions } from "../../features/agent-status/useIslandAgentSessions";
import { isRemoteSessionReport } from "../../features/agent-status/remoteSessions";
import { useAgentUsages } from "../../features/agent-status/useAgentUsages";

/**
 * The agent status, the island's agent sessions, the one the collapsed island names while it runs
 * (`agentTitleMode` running) and the one shown for a moment when its session changes (the
 * default, and over lyrics when they come first), and every
 * agent's phase for the center pattern's pet, and Claude's and Codex's usage limits for the Agent page.
 */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  const sessions = useIslandAgentSessions(settings, agentStatus.others);
  // Reports from other computers are among the sessions already; the rest stay as reports.
  const others = useMemo(() => agentStatus.others?.filter((report) => !isRemoteSessionReport(report)), [agentStatus.others]);
  const titlesOn = settings.agentStatusEnabled && settings.agentTitleEnabled;
  const whileRunning = settings.agentTitleMode === "running";
  const agentSession = useAgentSession(sessions.agentSessions, others, titlesOn && whileRunning);
  const agentInterjection = useAgentInterjection(
    sessions.agentSessions,
    titlesOn && (!whileRunning || (settings.musicEnabled && settings.lyricsOnIsland && settings.lyricsIslandPriority === "lyrics")),
  );
  // Every session and reported agent, finished ones included: the center pattern's pet acts them out.
  const agentActivity = useMemo(
    () => [...sessions.agentSessions, ...(others ?? [])],
    [sessions.agentSessions, others],
  );

  // Read with the page closed too: the page is sized for the usage lines it will show, and the
  // usage alert (agentQuotaAlertPercent) watches them.
  const agentUsages = useAgentUsages(settings.agentStatusEnabled && (settings.agentShowUsage || settings.agentQuotaAlertPercent > 0));

  return { agentStatus, ...sessions, agentSession, agentInterjection, agentActivity, agentUsages };
}
