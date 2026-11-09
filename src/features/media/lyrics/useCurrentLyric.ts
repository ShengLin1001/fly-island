import { useEffect, useMemo, useState } from "react";
import type { MediaState } from "../api";
import { longestLyric, lyricAt, playbackPosition, type LyricLine } from "./lrc";

export type CurrentLyric = {
  /** The line being sung, or null when nothing is: paused, before the first line, in a break. */
  text: string | null;
  /** Changes with each line, so the bar can fade the next one in. */
  index: number;
  /** The song's longest line, for sizing the island once per song. */
  longest: string;
};

const NONE: CurrentLyric = { text: null, index: -1, longest: "" };

/**
 * The line sung now, for the collapsed island. Rather than ticking, it wakes when the next line
 * starts, so the island renders once per line. Paused, or with `active` false, there is none.
 */
export function useCurrentLyric(lines: LyricLine[] | null, mediaState: MediaState, offsetMs: number, active: boolean): CurrentLyric {
  const [now, setNow] = useState(() => Date.now());
  const on = active && mediaState.playbackStatus === "playing" && lines !== null && lines.length > 0;
  const position = playbackPosition(mediaState, now) - offsetMs;
  const at = on && lines ? lyricAt(lines, position) : null;
  const nextAt = at?.nextAt ?? null;

  // A new report from the player (seek, pause, next track) restarts the clock from it.
  useEffect(() => {
    setNow(Date.now());
  }, [mediaState.updatedAt, offsetMs, on]);

  useEffect(() => {
    if (!on || nextAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(20, nextAt - position + 20));
    return () => window.clearTimeout(timer);
  }, [on, nextAt, position]);

  const longest = useMemo(() => (lines ? longestLyric(lines) : ""), [lines]);
  return at ? { text: at.text, index: at.index, longest } : NONE;
}
