import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMediaState, sendMediaCommand, type MediaCommand, type MediaPlaybackStatus, type MediaSessionChange, type MediaState } from "./api";
import { AUDIO_ACTIVE_THRESHOLD, DEFAULT_MEDIA_STATE, isSameMediaState } from "./mediaState";
import { advanceClock, alignClock, clockPosition, hasTimeline, NO_CLOCK, startClockAt, type TrackClock } from "./trackClock";
import { useAudioLevel } from "./useAudioLevel";
import { useMediaSessionChanges } from "./useMediaSessionChanges";
import { useMusicSourcePriority } from "./useMusicSourcePriority";

/**
 * Media session state, playback commands and the source the island currently controls.
 * With `enabled` false (music switched off) nothing is polled and the state stays empty.
 */
export function useMediaState(enabled = true) {
  const [mediaState, setMediaState] =
    useState<MediaState>(DEFAULT_MEDIA_STATE);
  const [isMediaTrackChanging, setIsMediaTrackChanging] = useState(false);
  const [mediaCommandError, setMediaCommandError] = useState<string | null>(
    null,
  );
  const mediaTargetRef = useRef<string | null>(null);
  const isRefreshingMediaState = useRef(false);
  const isRunningMediaCommand = useRef(false);
  const trackClock = useRef<TrackClock>(NO_CLOCK);
  // Changes the player announced while a reading was under way; each gets its own reading.
  const pendingChanges = useRef<MediaSessionChange[]>([]);
  const mediaPlaybackIntent = useRef<{
    status: MediaPlaybackStatus;
    expiresAt: number;
  } | null>(null);
  const { musicSourcePriority, reorderMusicSource, removeMusicSource } =
    useMusicSourcePriority(mediaState.sessions);

  /** Reads the player's state; `change`, an event it raised, times the clock to the event. */
  const refreshMediaState = useCallback(async function refresh(change?: MediaSessionChange): Promise<void> {
    if (isRefreshingMediaState.current) {
      if (change) pendingChanges.current.push(change);
      return;
    }

    isRefreshingMediaState.current = true;

    try {
      const nextMediaState = await getMediaState(
        mediaTargetRef.current ?? undefined,
      );

      const now = Date.now();
      const intent = mediaPlaybackIntent.current;
      const playbackStatus =
        intent && now < intent.expiresAt
          ? intent.status
          : nextMediaState.playbackStatus;

      if (intent && now >= intent.expiresAt) {
        mediaPlaybackIntent.current = null;
      }

      // A player that reports no position (NetEase Cloud Music) is timed by the island.
      const untimed = nextMediaState.title && !hasTimeline(nextMediaState)
        ? `${nextMediaState.sourceApp ?? ""}\u001f${nextMediaState.title}\u001f${nextMediaState.artist ?? ""}`
        : null;
      // An event from the player read here counts from when it happened, not from this reading.
      const event = change && (change.sessionId === null || change.sessionId === nextMediaState.activeSessionId) ? change : null;
      const playing = playbackStatus === "playing";
      trackClock.current = !untimed
        ? NO_CLOCK
        : event?.kind === "track"
          ? startClockAt(trackClock.current, untimed, playing, event.at, now)
          : advanceClock(trackClock.current, untimed, playing, event ? Math.min(event.at, now) : now);
      const timeline = untimed
        ? { positionMs: clockPosition(trackClock.current, now), updatedAt: now, positionEstimate: trackClock.current.fromStart ? "timed" as const : "unsure" as const }
        : {};

      setMediaState((currentState) => {
        const nextPeak = Math.max(
          currentState.audioPeak * 0.82,
          nextMediaState.audioPeak,
        );
        const audioActive = playbackStatus !== "paused" &&
          (nextMediaState.audioActive || nextPeak > AUDIO_ACTIVE_THRESHOLD);
        const audioPeak = audioActive ? nextPeak : 0;

        const merged: MediaState = {
          ...nextMediaState,
          ...timeline,
          audioActive,
          audioPeak,
          playbackStatus,
        };

        if (isSameMediaState(currentState, merged)) {
          return currentState;
        }

        return merged;
      });
    } catch (error) {
      console.error("Failed to read media state", error);
      setMediaState(DEFAULT_MEDIA_STATE);
    } finally {
      isRefreshingMediaState.current = false;
      const next = pendingChanges.current.shift();
      if (next) void refresh(next);
    }
  }, []);

  const runMediaCommand = useCallback(
    async (command: MediaCommand) => {
      if (isRunningMediaCommand.current) {
        return;
      }

      const target = mediaTargetRef.current ?? undefined;
      const isPlayPause = command === "media_play_pause";
      const isTrackChange =
        command === "media_next" || command === "media_previous";
      const isTransport = isPlayPause || isTrackChange;

      const intendedStatus: MediaPlaybackStatus = isPlayPause
        ? mediaState.playbackStatus === "playing"
          ? "paused"
          : "playing"
        : mediaState.playbackStatus;

      if (isTransport) {
        mediaPlaybackIntent.current = {
          status: intendedStatus,
          expiresAt: Date.now() + (isPlayPause ? 1200 : 1800),
        };

        if (isPlayPause) {
          setMediaState((currentState) => ({
            ...currentState,
            available: intendedStatus === "playing" || currentState.available,
            audioActive:
              intendedStatus === "playing" && currentState.audioActive,
            audioPeak:
              intendedStatus === "paused" ? 0 : currentState.audioPeak,
            playbackStatus: intendedStatus,
            updatedAt: Date.now(),
          }));
        }
      }

      isRunningMediaCommand.current = true;
      setIsMediaTrackChanging(isTrackChange);
      setMediaCommandError(null);
      try {
        const nextMediaState = await sendMediaCommand(command, target);

        if (!isTransport) {
          setMediaState((currentState) =>
            isSameMediaState(currentState, nextMediaState)
              ? currentState
              : nextMediaState,
          );
          return;
        }

        setMediaState((currentState) => {
          if (intendedStatus === "paused") {
            return {
              ...nextMediaState,
              audioActive: false,
              audioPeak: 0,
              playbackStatus: intendedStatus,
            };
          }

          return {
            ...nextMediaState,
            audioActive:
              nextMediaState.audioActive || currentState.audioActive,
            audioPeak: Math.max(
              nextMediaState.audioPeak,
              currentState.audioPeak * 0.82,
            ),
            playbackStatus: intendedStatus,
          };
        });
      } catch (error) {
        console.error(`Failed to run media command: ${command}`, error);
        setMediaCommandError(String(error));
        mediaPlaybackIntent.current = null;
        await refreshMediaState();
      } finally {
        isRunningMediaCommand.current = false;
        setIsMediaTrackChanging(false);
      }
    },
    [mediaState.playbackStatus, refreshMediaState],
  );

  // The fast meter only runs while something plays: each read starts a COM thread natively. The
  // 1.5s state poll below also reads the peak, so sound from a player without a media session
  // still switches it on.
  useAudioLevel(
    setMediaState,
    mediaPlaybackIntent,
    enabled && (mediaState.playbackStatus === "playing" || mediaState.audioActive),
  );

  useMediaSessionChanges(enabled, refreshMediaState);

  useEffect(() => {
    if (!enabled) {
      setMediaState(DEFAULT_MEDIA_STATE);
      return;
    }

    void refreshMediaState();

    const interval = window.setInterval(() => {
      void refreshMediaState();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [enabled, refreshMediaState]);

  const effectiveMediaTarget = useMemo(() => {
    if (mediaState.sessions.length === 0) {
      return null;
    }

    const present = new Map(
      mediaState.sessions.map((session) => [session.id, session]),
    );

    for (const source of musicSourcePriority) {
      if (present.get(source.id)?.playing) {
        return source.id;
      }
    }
    for (const source of musicSourcePriority) {
      if (present.has(source.id)) {
        return source.id;
      }
    }
    return null;
  }, [musicSourcePriority, mediaState.sessions]);

  useEffect(() => {
    if (!enabled || mediaTargetRef.current === effectiveMediaTarget) {
      return;
    }
    mediaTargetRef.current = effectiveMediaTarget;
    mediaPlaybackIntent.current = null;
    void refreshMediaState();
  }, [effectiveMediaTarget, enabled, refreshMediaState]);

  /** Sets the island's own timing of the track to `positionMs`, as when the user picks the line being sung. */
  const alignPosition = useCallback((positionMs: number) => {
    if (trackClock.current.key === null) return;
    const now = Date.now();
    trackClock.current = alignClock(trackClock.current, positionMs, now);
    setMediaState((current) => ({ ...current, positionMs: Math.max(0, positionMs), updatedAt: now, positionEstimate: "timed" }));
  }, []);

  return {
    mediaState,
    alignPosition,
    isMediaTrackChanging,
    mediaCommandError,
    musicSourcePriority,
    runMediaCommand,
    reorderMusicSource,
    removeMusicSource,
  };
}
