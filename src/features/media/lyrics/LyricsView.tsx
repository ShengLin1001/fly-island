import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "../../../i18n";
import type { MediaState } from "../api";
import { lineIndexAt, playbackPosition, wordFill, type LyricLine, type LyricWord } from "./lrc";
import "./LyricsView.css";

/** How often the line is checked while playing. */
const TICK_MS = 200;

/**
 * A line timed word by word: each word fills from dim to bright as it is sung. The timings are
 * taken once, when the line appears or the player reports a new position (the caller re-keys
 * it), and the browser runs them from there; pausing pauses them.
 */
function SungWords({ words, positionMs, playing }: { words: LyricWord[]; positionMs: number; playing: boolean }) {
  const [start] = useState(positionMs);
  return words.map((word, index) => {
    const { delayMs, durationMs } = wordFill(word, start);
    const style = {
      animationDelay: `${delayMs}ms`,
      animationDuration: `${durationMs}ms`,
      animationPlayState: playing ? "running" : "paused",
    } as CSSProperties;
    return <span className="lyrics-view__word" key={index} style={style}>{word.text}</span>;
  });
}

/**
 * Three lines of synced lyrics: the one being sung, bright and up to two lines long, between
 * the one before and the one after. A line with a translation shows it under itself in place
 * of the next line. `offsetMs` moves the lyrics later (positive) or earlier. With `onPickLine`
 * (the island only estimates the position) each line is a button that aligns the timing to it.
 */
export function LyricsView({ lines, mediaState, offsetMs, onPickLine }: {
  lines: LyricLine[];
  mediaState: MediaState;
  offsetMs: number;
  /** Called with the position at which the picked line starts. */
  onPickLine?: (positionMs: number) => void;
}) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const playing = mediaState.playbackStatus === "playing";

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, mediaState.updatedAt]);

  const position = playbackPosition(mediaState, now) - offsetMs;
  const index = lineIndexAt(lines, position);
  const words = index >= 0 ? lines[index].words : undefined;
  const text = (at: number) => (at >= 0 && at < lines.length ? lines[at].text : "");
  // Before the first line (the intro) and in breaks, a note holds the middle row, so the first
  // line waits below it rather than standing alone.
  const current = (index >= 0 && text(index)) || "♪";
  // A row that aligns the timing to its line when the island only estimates the position.
  const row = (at: number, className: string, content: ReactNode, key?: number) => {
    const line = at >= 0 && at < lines.length ? lines[at] : null;
    if (!onPickLine || !line?.text) {
      return <span className={className} key={key} aria-hidden={className.includes("--side") ? true : undefined}>{content}</span>;
    }
    return (
      <button type="button" className={`${className} lyrics-view__pick`} key={key} aria-label={t.music.alignToLine(line.text)} onClick={() => onPickLine(line.timeMs + offsetMs)}>
        {content}
      </button>
    );
  };

  return (
    <div className={onPickLine ? "lyrics-view lyrics-view--pickable" : "lyrics-view"} aria-label={t.music.lyricsLabel}>
      {row(index - 1, "lyrics-view__line lyrics-view__line--side", text(index - 1))}
      {row(index, "lyrics-view__line lyrics-view__line--current", words
        ? <SungWords key={`${mediaState.updatedAt}:${offsetMs}`} words={words} positionMs={position} playing={playing} />
        : current, index)}
      {index >= 0 && lines[index].translation ? (
        <span className="lyrics-view__line lyrics-view__line--translation">{lines[index].translation}</span>
      ) : (
        row(index + 1, "lyrics-view__line lyrics-view__line--side", text(index + 1))
      )}
    </div>
  );
}
