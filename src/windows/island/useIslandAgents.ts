import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { useAgentStatus } from "../../features/agent-status/useAgentStatus";
import { useAgentSession } from "../../features/agent-status/useAgentSession";
import { useAgentSessions } from "../../features/agent-status/useAgentSessions";
import { countActiveSessions, filterSessions, isActivePhase } from "../../features/agent-status/sessionList";

/** The agent status, the sessions the Agent page lists, how many still work, and the one the collapsed island names. */
export function useIslandAgents(settings: IslandSettings) {
  const agentStatus = useAgentStatus(settings.agentStatusEnabled);
  // Read every second: the collapsed island names sessions from it and holds a finished one's
  // title for three seconds after its file last changed. Answered from a cache in about 1 ms.
  const allAgentSessions = useAgentSessions(settings.agentStatusEnabled, 1000, settings.agentSessionHours);
  // Agents switched off in Settings → AI Agent are left out of the page and the count.
  const agentSessions = useMemo(
    () => filterSessions(allAgentSessions, { claudeCode: settings.agentShowClaudeCode, codex: settings.agentShowCodex }),
    [allAgentSessions, settings.agentShowClaudeCode, settings.agentShowCodex],
  );
  const listedAgentSessions = useMemo(
    () => (settings.agentHideFinished ? agentSessions.filter((session) => isActivePhase(session.phase)) : agentSessions),
    [agentSessions, settings.agentHideFinished],
  );
  const activeAgentSessionCount = countActiveSessions(agentSessions);
  const agentSession = useAgentSession(
    agentSessions,
    agentStatus.others,
    settings.agentStatusEnabled && settings.agentTitleEnabled,
  );

  return { agentStatus, listedAgentSessions, activeAgentSessionCount, agentSession };
}
