import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { playbackPosition } from "./lyrics/lrc";
import "./MusicProgress.css";

const TICK_MS = 500;

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * Where the track is, for players that report their position and length: the time played, a
 * thin bar and the length. Players that report neither (NetEase without its InfLink plugin)
 * get no bar: the island only estimates their position (MusicPlayerPanel says so instead).
 */
export function MusicProgress({ mediaState }: { mediaState: MediaState }) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";
  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  const position = playbackPosition(mediaState, now);
  const share = Math.min(1, position / mediaState.durationMs);
  return (
    <div
      className="music-progress"
      role="progressbar"
      aria-label={t.music.progress(clock(position), clock(mediaState.durationMs))}
      aria-valuemin={0}
      aria-valuemax={Math.round(mediaState.durationMs / 1000)}
      aria-valuenow={Math.round(position / 1000)}
    >
      <span className="music-progress__time">{clock(position)}</span>
      <span className="music-progress__track" aria-hidden="true">
        <span className="music-progress__fill" style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className="music-progress__time">{clock(mediaState.durationMs)}</span>
    </div>
  );
}
