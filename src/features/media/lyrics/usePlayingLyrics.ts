import type { MediaState } from "../api";
import { trackKey, type LyricLine } from "./lrc";
import { useLyrics, type LyricsSettings } from "./useLyrics";
import { useSongOffset } from "./useSongOffset";

/** The playing track's lyrics and how far they are moved, shared by the music page and the collapsed island. */
export type PlayingLyrics = {
  lines: LyricLine[] | null;
  notFound: boolean;
  /** This song's own offset (ms, positive = later), set on the music page. */
  songOffsetMs: number;
  setSongOffsetMs: (ms: number) => void;
  /** The settings' offset and the song's together. */
  offsetMs: number;
};

const NO_SOURCES: LyricsSettings = { lyricsFolder: "", lyricsOnline: false };

/**
 * Looks the playing track's lyrics up once per track. With `enabled` false nothing is looked up
 * (nothing shows the lyrics), so songs are not sent online for no reason.
 */
export function usePlayingLyrics(mediaState: MediaState, settings: LyricsSettings & { lyricsOffsetMs: number }, enabled = true): PlayingLyrics {
  const { lines, notFound } = useLyrics(mediaState, enabled ? settings : NO_SOURCES);
  const [songOffsetMs, setSongOffsetMs] = useSongOffset(lines ? trackKey(mediaState) : null);
  return { lines, notFound, songOffsetMs, setSongOffsetMs, offsetMs: settings.lyricsOffsetMs + songOffsetMs };
}
