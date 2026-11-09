import { invoke } from "@tauri-apps/api/core";

/** Mirrors Lyrics in src-tauri/src/lyrics/mod.rs. */
export type Lyrics = {
  source: "local" | "lrclib" | "kugou" | "netease";
  lrc: string;
  /** The translation of the same lines, in LRC, when the source has one. */
  translation?: string | null;
};

export type LyricsQuery = {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  /** The user's folder of .lrc files; empty when none. */
  folder: string;
  /** Whether LRCLIB may be asked. */
  online: boolean;
  /** Whether Kugou and NetEase may be asked too (unofficial; only with `online`). */
  chinese: boolean;
  /** The song id a player plugin gives (`NCM-<id>`), which skips the search. */
  trackId: string | null;
};

export function getLyrics(query: LyricsQuery) {
  return invoke<Lyrics | null>("get_lyrics", { query });
}

/** Mirrors InflinkState in src-tauri/src/lyrics/inflink.rs. */
export type InflinkState = {
  /** BetterNCM's data folder; null when BetterNCM was not found. */
  betterNcm: string | null;
  /** The installed InfLink-rs version. */
  installed: string | null;
  /** The newest InfLink-rs release; null when GitHub was not asked or could not be reached. */
  latest: string | null;
};

export function getInflinkState(checkLatest: boolean) {
  return invoke<InflinkState>("get_inflink_state", { checkLatest });
}

/** Installs or updates InfLink-rs in BetterNCM's plugins folder. */
export function installInflink() {
  return invoke<InflinkState>("install_inflink");
}
