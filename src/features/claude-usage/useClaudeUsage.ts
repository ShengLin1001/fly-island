import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentUsage, getCodexUsage, getPlanUsage, type AgentUsage } from "../agent-status/api";
import { refreshClaudeUsage } from "./api";
import type { UsageProviderId } from "./usageRing";

/** Same pace as the Agent page's usage line: claude-hud rewrites its snapshot about once a minute. */
const REFRESH_MS = 30_000;

/**
 * Reads each agent's usage; `refresh` (a click on its ring) asks the source again first where it
 * can: Anthropic when asking it directly, GLM or Kimi with the saved key (all throttled natively).
 * Codex's numbers only change when its session logs do, so a click just re-reads them.
 */
const READERS: Record<UsageProviderId, (refresh: boolean) => Promise<AgentUsage | null>> = {
  claudeCode: async (refresh) => {
    if (refresh) await refreshClaudeUsage().catch((error: unknown) => console.error("Failed to refresh Claude usage", error));
    return getAgentUsage();
  },
  codex: () => getCodexUsage(),
  glm: (refresh) => getPlanUsage("glm", refresh),
  kimi: (refresh) => getPlanUsage("kimi", refresh),
};

/**
 * One agent's usage for its ring: Claude's is what the Agent page reads (`get_agent_usage`:
 * claude-hud's snapshot, or Anthropic's answer when the ring asks it directly). Re-read every
 * 30 seconds while `enabled`, with the time it was read for staleness and countdowns; `null`
 * until there is any.
 */
export function useClaudeUsage(provider: UsageProviderId = "claudeCode", enabled = true) {
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [nonce, setNonce] = useState(0);
  const refreshNext = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = (refresh: boolean) => {
      void READERS[provider](refresh)
        .then((next) => {
          if (!cancelled) {
            setUsage(next);
            setNow(Date.now());
          }
        })
        .catch((error: unknown) => console.error(`Failed to read ${provider} usage`, error));
    };
    read(refreshNext.current);
    refreshNext.current = false;
    const timer = window.setInterval(() => read(false), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [provider, enabled, nonce]);

  /** Asks the source again (see READERS), re-reads and restarts the timer. */
  const refresh = useCallback(() => {
    refreshNext.current = true;
    setNonce((value) => value + 1);
  }, []);

  return { usage, now, refresh };
}
