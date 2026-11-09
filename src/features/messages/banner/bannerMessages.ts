import type { MessagePreview } from "../messagePreview";

/** How long a banner stays when its message does not say (plugins give their own durationMs). */
export const BANNER_MS = 5_000;

/** Every source shows as a banner; WeChat's says only that it has a new reminder. */
export type BannerMessage = MessagePreview & {
  durationMs: number;
  /** A plugin notification's buttons; empty for the other sources. */
  actions: { id: string; title: string }[];
};

/** The banner on screen: the newest message, and how many came before it while it showed. */
export type BannerState<T extends BannerMessage = BannerMessage> = {
  message: T;
  more: number;
  /** Bumped by every arrival, so the timer restarts. */
  version: number;
};

/** Identifies one arrival; a preview that is still the same message keeps the same key. */
export function bannerKey(preview: MessagePreview): string {
  return `${preview.source}:${preview.receivedAt}`;
}

/** A message arriving: it starts a banner, or joins the one showing as the newest of a group. */
export function addBannerMessage<T extends BannerMessage>(state: BannerState<T> | null, message: T): BannerState<T> {
  if (state && bannerKey(state.message) === bannerKey(message)) return state;
  return { message, more: state ? state.more + 1 : 0, version: (state?.version ?? 0) + 1 };
}

/** "09:05": the arrival time on the banner, on the local clock. */
export function bannerClock(receivedAt: number): string {
  const date = new Date(receivedAt);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
