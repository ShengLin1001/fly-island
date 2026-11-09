import { useEffect } from "react";
import { listenMediaSessionChanges, type MediaSessionChange } from "./api";

/**
 * Reads the player's state the moment it announces a new track, play or pause
 * (src-tauri/src/media_control/events.rs), instead of at the next 1.5 s poll.
 */
export function useMediaSessionChanges(enabled: boolean, onChange: (change: MediaSessionChange) => void) {
  useEffect(() => {
    if (!enabled) return;
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenMediaSessionChanges(onChange)
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => console.error("Failed to watch the media session", error));
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, [enabled, onChange]);
}
