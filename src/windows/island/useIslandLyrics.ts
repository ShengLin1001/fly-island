import type { IslandSettings } from "../../features/appearance/types";
import type { MediaState } from "../../features/media/api";
import { useCurrentLyric, type CurrentLyric } from "../../features/media/lyrics/useCurrentLyric";
import { usePlayingLyrics, type PlayingLyrics } from "../../features/media/lyrics/usePlayingLyrics";
import { songLine } from "../../features/media/lyrics/songLine";
import type { IslandPage } from "./types";

type IslandLyricsOptions = {
  page: IslandPage;
  /** The collapsed bar's text is on screen: collapsed, not tucked, collapsed text on. */
  barShown: boolean;
};

/**
 * The playing track's lyrics, looked up once for both the music page and the collapsed bar, and
 * the line the bar can show (null while nothing is sung or the bar is not showing lyrics). With
 * lyrics first, a playing song without lyrics gives its name instead.
 */
export function useIslandLyrics(settings: IslandSettings, mediaState: MediaState, { page, barShown }: IslandLyricsOptions): {
  lyrics: PlayingLyrics;
  lyricLine: CurrentLyric | null;
} {
  const onIsland = settings.musicEnabled && settings.lyricsOnIsland;
  const lyrics = usePlayingLyrics(mediaState, settings, onIsland || page === "music");
  const current = useCurrentLyric(lyrics.lines, mediaState, lyrics.offsetMs, onIsland && barShown);
  if (current.text) return { lyrics, lyricLine: current };
  // Lyrics first, and none found for this song: its name keeps the lyric's place on the bar.
  const song = onIsland && barShown && settings.lyricsIslandPriority === "lyrics" ? songLine(mediaState, lyrics.notFound) : null;
  return { lyrics, lyricLine: song };
}
