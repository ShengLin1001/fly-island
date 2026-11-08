import { useCallback, useEffect, useState } from "react";
import { addBannerMessage, bannerKey, type BannerMessage, type BannerState } from "./bannerMessages.ts";

/**
 * The banner below the collapsed island. `incoming` is the newest message preview (null when
 * none); each new arrival starts a banner or joins the one showing. The banner keeps its own
 * time, `durationMs` from the latest arrival, held while `paused` (the pointer rests on it) and
 * restarted in full after. With `enabled` false (expanded, tucked, quiet for a game) it goes at
 * once; a preview still live when it turns true again (a tucked island sliding out for the
 * message) shows then.
 */
export function useMessageBanner<T extends BannerMessage>(enabled: boolean, incoming: T | null, paused: boolean) {
  const [banner, setBanner] = useState<BannerState<T> | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const key = incoming ? bannerKey(incoming) : null;

  if (enabled && incoming && key !== seenKey) {
    setSeenKey(key);
    setBanner((current) => addBannerMessage(current, incoming));
  }
  if (!enabled && banner) setBanner(null);

  useEffect(() => {
    if (!banner || paused) return;
    const timer = window.setTimeout(() => setBanner(null), banner.message.durationMs);
    return () => window.clearTimeout(timer);
  }, [banner, paused]);

  const close = useCallback(() => setBanner(null), []);
  return { banner, close };
}
