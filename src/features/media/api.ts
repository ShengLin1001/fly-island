import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 与 src-tauri/src/media_control/service.rs 中的 MediaState、MediaSessionInfo、AudioLevel 对应。
export type MediaPlaybackStatus = "unavailable" | "playing" | "paused";

export type MediaRepeatMode = "none" | "track" | "list" | "unknown";

export type MediaSessionInfo = {
  id: string;
  label: string;
  playing: boolean;
};

export type MediaState = {
  available: boolean;
  audioActive: boolean;
  audioPeak: number;
  playbackStatus: MediaPlaybackStatus;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail: string | null;
  /** A song id a player plugin gives (`NCM-<id>`, `QQ-<id>`); missing from older builds. */
  trackId?: string | null;
  positionMs: number;
  durationMs: number;
  /**
   * Set when the player reports no position and the island times the track (trackClock.ts):
   * "timed" when it saw the track start or the user aligned it, "unsure" when the track may
   * have been playing before. Absent for players that report their position.
   */
  positionEstimate?: "timed" | "unsure";
  canSeek: boolean;
  canNext: boolean;
  canPrevious: boolean;
  shuffleActive: boolean | null;
  canShuffle: boolean;
  repeatMode: MediaRepeatMode;
  canRepeat: boolean;
  volume: number;
  sourceApp: string | null;
  activeSessionId: string | null;
  sessions: MediaSessionInfo[];
  updatedAt: number;
};

export type AudioLevel = {
  active: boolean;
  peak: number;
  updatedAt: number;
};

export type MediaCommand = "media_play_pause" | "media_next" | "media_previous";

export function getMediaState(target: string | undefined) {
  return invoke<MediaState>("get_media_state", { target });
}

export function sendMediaCommand(command: MediaCommand, target: string | undefined) {
  return invoke<MediaState>(command, { target });
}

export function getAudioLevel() {
  return invoke<AudioLevel>("get_audio_level");
}

// Mirrors MEDIA_SESSION_CHANGED_EVENT in src-tauri/src/media_control/events.rs.
export const MEDIA_SESSION_CHANGED_EVENT = "media-session-changed";

/** A player changed track or played / paused (SessionChange in src-tauri/src/media_control/events.rs). */
export type MediaSessionChange = {
  /** "track": another song started, `at` when its sound began; "playback": it played or paused. */
  kind: "track" | "playback";
  /** Unix milliseconds. */
  at: number;
  sessionId: string | null;
};

export function listenMediaSessionChanges(handler: (change: MediaSessionChange) => void) {
  return listen<MediaSessionChange>(MEDIA_SESSION_CHANGED_EVENT, ({ payload }) => handler(payload));
}
