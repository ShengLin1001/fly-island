import { useEffect, useState } from "react";
import { getClaudeSessions, listenClaudeSessions, type ClaudeSessionsSnapshot } from "./api";
import { sameClaudeSessions } from "./sessionRing.ts";

function logError(error: unknown) {
  console.error("Failed to read Claude sessions", error);
}

/**
 * claude-sessions' sessions while `enabled`: read once, then kept current by the native
 * watcher's events (started by the session ring's built-in plugin). `null` until the first read.
 */
export function useClaudeSessions(enabled: boolean): ClaudeSessionsSnapshot | null {
  const [snapshot, setSnapshot] = useState<ClaudeSessionsSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }
    let didCancel = false;
    let heardEvent = false;
    let unlisten: (() => void) | null = null;
    const apply = (next: ClaudeSessionsSnapshot) => {
      if (!didCancel) setSnapshot((current) => (sameClaudeSessions(current, next) ? current : next));
    };
    void listenClaudeSessions((next) => {
      heardEvent = true;
      apply(next);
    })
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch(logError);
    // An event that beat the first read is newer; the watcher only re-sends on change.
    void getClaudeSessions()
      .then((next) => {
        if (!heardEvent) apply(next);
      })
      .catch(logError);
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [enabled]);

  return snapshot;
}
