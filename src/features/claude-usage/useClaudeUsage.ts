import { useCallback, useEffect, useState } from "react";
import { getClaudeUsage, listenClaudeUsage, refreshClaudeUsage, type ClaudeUsage } from "./api";
import { newerUsage } from "./usageRing";

export const EMPTY_CLAUDE_USAGE: ClaudeUsage = { fiveHour: null, sevenDay: null, source: null, updatedAt: null, error: null };

/** Ticks once a minute so reset countdowns and the stale grey stay current between snapshots. */
const NOW_TICK_MS = 60_000;

/**
 * The latest Claude usage snapshot pushed by the native poller, and the current time for
 * staleness and countdowns. The poller itself is started by the built-in plugin.
 */
export function useClaudeUsage(enabled = true) {
  const [usage, setUsage] = useState<ClaudeUsage>(EMPTY_CLAUDE_USAGE);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let didCancel = false;
    let unlisten: (() => void) | undefined;
    getClaudeUsage()
      .then((snapshot) => {
        if (!didCancel) setUsage((current) => newerUsage(current, snapshot));
      })
      .catch((error) => console.error("Failed to read Claude usage", error));
    listenClaudeUsage((snapshot) => setUsage((current) => newerUsage(current, snapshot)))
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => console.error("Failed to listen for Claude usage", error));
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await refreshClaudeUsage();
      setUsage((current) => newerUsage(current, snapshot));
    } catch (error) {
      console.error("Failed to refresh Claude usage", error);
    }
  }, []);

  return { usage, now, refresh };
}
