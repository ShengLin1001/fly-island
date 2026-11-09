import { ArrowUpRight, Music2, Pause, Play, RefreshCcw, Settings, SkipBack, SkipForward } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import { MediaWaveform } from "./MediaWaveform";
import { MusicProgress } from "./MusicProgress";
import { LyricsView } from "./lyrics/LyricsView";
import type { LyricsSettings } from "./lyrics/useLyrics";
import { LyricsOffsetControl } from "./lyrics/LyricsOffsetControl";
import { suggestsChineseSources } from "./lyrics/chineseHint";
import { usePlayingLyrics, type PlayingLyrics } from "./lyrics/usePlayingLyrics";
import "./MusicPlayerPanel.css";

const NO_LYRICS = { lyricsFolder: "", lyricsOnline: false, lyricsOffsetMs: 0 };
/** The NetEase Cloud Music plugin that reports the position and song id to Windows. */
const INFLINK_URL = "https://github.com/apoint123/InfLink-rs";
const isNetEase = (sourceApp: string | null) => /cloudmusic/i.test(sourceApp ?? "");

export function MusicPlayerPanel({
  mediaState,
  isTrackChanging,
  commandError,
  onOpenSettings,
  onPlayPause,
  onNext,
  onPrevious,
  lyricsSettings = NO_LYRICS,
  lyrics: shared,
  onAlignLyrics,
}: {
  mediaState: MediaState;
  isTrackChanging: boolean;
  commandError: string | null;
  /** Opens Settings > Music, where the source order is set. */
  onOpenSettings: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Where lyrics come from and how far they are moved; without it there are none. */
  lyricsSettings?: LyricsSettings & { lyricsOffsetMs: number };
  /** Lyrics the island already looked up (it shows them collapsed too); without them the page looks them up itself. */
  lyrics?: PlayingLyrics;
  /** Sets the island's own timing of the track (players that report no position). */
  onAlignLyrics?: (positionMs: number) => void;
}) {
  const t = useTranslation();
  const isPlaying = mediaState.playbackStatus === "playing";
  const hasTrack = Boolean(mediaState.title);
  const own = usePlayingLyrics(mediaState, lyricsSettings, !shared);
  const { lines: lyrics, notFound, songOffsetMs, setSongOffsetMs, offsetMs } = shared ?? own;
  const chineseHint = suggestsChineseSources(mediaState, lyricsSettings, notFound);

  const estimate = mediaState.positionEstimate;
  const source = mediaState.sessions.find((session) => session.id === mediaState.activeSessionId)?.label ?? null;

  const prevDisabled = mediaState.available && !mediaState.canPrevious;
  const nextDisabled = mediaState.available && !mediaState.canNext;

  const meta = [hasTrack ? (mediaState.artist ?? t.music.unknownArtist) : null, source].filter(Boolean).join(" · ");

  // Straight on the island like the Agent page (no card of its own): what is playing on one
  // line at the top, the lyrics across the full width, then the time and the controls.
  return (
    <section className={mediaState.available ? "music-player" : "music-player music-player--empty"} aria-label={t.music.playerLabel}>
      <header className="music-player__head">
        <div className="music-player__artwork" aria-hidden="true">
          {mediaState.thumbnail ? <img src={mediaState.thumbnail} alt="" draggable={false} /> : <Music2 size={24} strokeWidth={1.7} />}
        </div>
        <div className="music-player__meta">
          <span className="music-player__track">{mediaState.title ?? t.music.noMedia}</span>
          {meta && <span className="music-player__artist">{meta}</span>}
        </div>
        {chineseHint && (
          <button className="music-player__lyrics-hint" type="button" aria-label={t.music.lyricsChineseHint.label} onClick={onOpenSettings}>
            {t.music.lyricsChineseHint.text}
          </button>
        )}
        <span className="music-player__tune">
          {lyrics && <LyricsOffsetControl offsetMs={songOffsetMs} onChange={setSongOffsetMs} />}
          <button className="music-icon-button" type="button" aria-label={t.music.openSettings} onClick={onOpenSettings}>
            <Settings size={15} strokeWidth={2.2} />
          </button>
        </span>
      </header>

      {commandError && (
        <p className="music-player__error" role="alert">
          {t.music.controlFailed}
        </p>
      )}

      <div className="music-player__stage">
        {lyrics ? (
          <LyricsView lines={lyrics} mediaState={mediaState} offsetMs={offsetMs} onPickLine={estimate ? onAlignLyrics : undefined} />
        ) : (
          <MediaWaveform playing={isPlaying || mediaState.audioActive} audioPeak={mediaState.audioPeak} />
        )}
      </div>

      {mediaState.durationMs > 0 ? (
        <MusicProgress mediaState={mediaState} />
      ) : estimate && lyrics ? (
        <p className="music-player__estimate">
          <span>{estimate === "unsure" ? t.music.estimate.unsure : t.music.estimate.timed}</span>
          {isNetEase(mediaState.sourceApp) && (
            <button className="music-player__estimate-link" type="button" onClick={() => void openUrl(INFLINK_URL).catch(() => {})}>
              {t.music.estimate.inflink}
              <ArrowUpRight size={11} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </p>
      ) : null}

      <div className="music-player__controls">
        <button className="music-control-button" type="button" aria-label={t.music.previousTrack} disabled={prevDisabled} onClick={onPrevious}>
          <SkipBack size={18} strokeWidth={2.2} />
        </button>
        <button
          className="music-control-button music-control-button--primary"
          type="button"
          aria-label={isPlaying ? t.music.pause : t.music.play}
          aria-busy={isTrackChanging}
          onClick={onPlayPause}
        >
          {isTrackChanging ? (
            <RefreshCcw className="music-control-button__track-change" size={16} strokeWidth={2.4} />
          ) : isPlaying ? (
            <Pause size={17} strokeWidth={2.5} />
          ) : (
            <Play size={17} strokeWidth={2.5} />
          )}
        </button>
        <button className="music-control-button" type="button" aria-label={t.music.nextTrack} disabled={nextDisabled} onClick={onNext}>
          <SkipForward size={18} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );
}
