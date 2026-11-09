import type { CurrentLyric } from "./useCurrentLyric";

/**
 * What the collapsed island shows for a playing song no lyrics were found for, with lyrics first:
 * "title - artist" in the lyric's place, so music stays on the bar rather than an agent or a todo.
 * Null when the song is not playing, has no title, or the lookup found lyrics or has not finished.
 */
export function songLine(
  track: { title: string | null; artist: string | null; playbackStatus: string },
  notFound: boolean,
): CurrentLyric | null {
  const title = track.title?.trim();
  if (!notFound || !title || track.playbackStatus !== "playing") return null;
  const artist = track.artist?.trim();
  const text = artist ? `${title} - ${artist}` : title;
  return { text, index: -2, longest: text, song: true };
}
