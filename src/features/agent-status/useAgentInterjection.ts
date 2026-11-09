import { useEffect, useMemo, useRef, useState } from "react";
import { phasesOf, type SessionPhases } from "./alerts.ts";
import type { AgentSessionSummary } from "./api";
import { AGENT_INTERJECTION_MS, interjectingSession, waitingSession } from "./interjection.ts";
import { sessionName, type AgentSession } from "./session.ts";
import { sessionKey } from "./unseen.ts";

/**
 * The agent to show in place of the lyrics on the collapsed island: one waiting on the user, for as
 * long as it waits, else one whose session just changed, for `AGENT_INTERJECTION_MS`. A newer
 * change takes over and starts the time again. Null when there is none or `enabled` is off.
 */
export function useAgentInterjection(sessions: AgentSessionSummary[], enabled: boolean): AgentSession | null {
  const previous = useRef<SessionPhases | null>(null);
  const [flash, setFlash] = useState<{ key: string; until: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      previous.current = null;
      return;
    }
    const changed = interjectingSession(previous.current, sessions);
    previous.current = phasesOf(sessions, previous.current);
    if (changed) setFlash({ key: sessionKey(changed), until: Date.now() + AGENT_INTERJECTION_MS });
  }, [enabled, sessions]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [flash]);

  return useMemo(() => {
    if (!enabled) return null;
    const shown = waitingSession(sessions) ?? (flash ? sessions.find((session) => sessionKey(session) === flash.key) : undefined);
    return shown ? sessionName(shown) : null;
  }, [enabled, flash, sessions]);
}
