/** The lyrics settings kept with the island's settings (Settings → Music → Lyrics). */
export type LyricsSettingValues = {
  lyricsFolder: string;
  lyricsOnline: boolean;
  lyricsChinese: boolean;
  lyricsOffsetMs: number;
  lyricsOnIsland: boolean;
  lyricsIslandPriority: LyricsIslandPriority;
};

/**
 * Who has the collapsed bar's text while a line is sung and an agent is named: the lyrics, with
 * an agent shown for a moment when its session changes (and while it waits on the user), or the agent.
 */
export type LyricsIslandPriority = "lyrics" | "agent";

/** No folder, nothing asked online until the user turns it on, no offset, not on the collapsed island. */
export const DEFAULT_LYRICS_SETTINGS: LyricsSettingValues = {
  lyricsFolder: "",
  lyricsOnline: false,
  lyricsChinese: false,
  lyricsOffsetMs: 0,
  lyricsOnIsland: false,
  lyricsIslandPriority: "lyrics",
};

/** Saved lyrics settings with anything missing or malformed set back to the default. */
export function normalizeLyricsSettings(saved: Partial<Record<keyof LyricsSettingValues, unknown>> | null | undefined): LyricsSettingValues {
  const offset = saved?.lyricsOffsetMs;
  return {
    lyricsFolder: typeof saved?.lyricsFolder === "string" ? saved.lyricsFolder.trim() : "",
    lyricsOnline: saved?.lyricsOnline === true,
    lyricsChinese: saved?.lyricsChinese === true,
    lyricsOnIsland: saved?.lyricsOnIsland === true,
    lyricsIslandPriority: saved?.lyricsIslandPriority === "agent" ? "agent" : "lyrics",
    lyricsOffsetMs: typeof offset === "number" && Number.isFinite(offset) ? Math.round(Math.min(3000, Math.max(-3000, offset)) / 100) * 100 : 0,
  };
}
