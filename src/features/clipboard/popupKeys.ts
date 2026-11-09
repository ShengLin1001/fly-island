/** Adds `id` to the end of a sequence being picked, or takes it out (C24.7). */
export function toggleQueued(queue: readonly string[], id: string): string[] {
  return queue.includes(id) ? queue.filter((queued) => queued !== id) : [...queue, id];
}

/**
 * What a key does in the clipboard window's list (C22.2): move the selection to `index`, paste the
 * row at `index` (`paste`), or nothing (null). Digits 1–9 paste that row, only when `digitsPaste`
 * (the search box is empty); Home / End and the arrows move, wrapping round at the ends.
 */
export function popupIndexAfterKey(key: string, current: number, count: number, digitsPaste: boolean): { index: number; paste: boolean } | null {
  if (count === 0) return null;
  if (digitsPaste && /^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return index < count ? { index, paste: true } : null;
  }
  switch (key) {
    case "ArrowDown":
      return { index: (current + 1) % count, paste: false };
    case "ArrowUp":
      return { index: (current - 1 + count) % count, paste: false };
    case "Home":
      return { index: 0, paste: false };
    case "End":
      return { index: count - 1, paste: false };
    default:
      return null;
  }
}
