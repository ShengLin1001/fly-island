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

/**
 * Kugou and NetEase start on where the system speaks Chinese, as LRCLIB has few Chinese songs;
 * they are still only asked once the user turns online lyrics on. A saved choice always wins.
 */
export function chineseLyricsByDefault(languages: readonly (string | undefined)[]): boolean {
  return languages.some((language) => typeof language === "string" && /^zh(-|_|$)/i.test(language));
}

function systemLanguages(): (string | undefined)[] {
  const navigator = (globalThis as { navigator?: { language?: string; languages?: readonly string[] } }).navigator;
  return [navigator?.language, ...(navigator?.languages ?? [])];
}

/** No folder, nothing asked online until the user turns it on, no offset, not on the collapsed island. */
export const DEFAULT_LYRICS_SETTINGS: LyricsSettingValues = {
  lyricsFolder: "",
  lyricsOnline: false,
  lyricsChinese: chineseLyricsByDefault(systemLanguages()),
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
    lyricsChinese: typeof saved?.lyricsChinese === "boolean" ? saved.lyricsChinese : DEFAULT_LYRICS_SETTINGS.lyricsChinese,
    lyricsOnIsland: saved?.lyricsOnIsland === true,
    lyricsIslandPriority: saved?.lyricsIslandPriority === "agent" ? "agent" : "lyrics",
    lyricsOffsetMs: typeof offset === "number" && Number.isFinite(offset) ? Math.round(Math.min(3000, Math.max(-3000, offset)) / 100) * 100 : 0,
  };
}
