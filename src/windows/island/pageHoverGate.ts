/**
 * When hovering a page button may start switching pages. Pages differ in width (the system
 * monitor 800, the calendar 680, others 560) and the island stays centred, so a page switch
 * slides the header's buttons sideways. A button that slides under a resting pointer gets a
 * pointer enter (and Chromium may send a move at the same spot), which used to switch again,
 * back and forth. So only a pointer that really moved counts, and not while the island is
 * still changing size after a page switch.
 */
export type PageHoverGate = { last: { x: number; y: number } | null; settleUntil: number };

/** Most of the island's 560ms resize (IslandShell.css); what is left moves the buttons a pixel or two. */
export const PAGE_SWITCH_SETTLE_MS = 450;

export function createPageHoverGate(): PageHoverGate {
  return { last: null, settleUntil: 0 };
}

/** The page changed (by hover, click or shortcut): hovering waits until the island has settled. */
export function settlePageHover(gate: PageHoverGate, now: number) {
  gate.settleUntil = now + PAGE_SWITCH_SETTLE_MS;
}

/**
 * A pointer move over a page button at (x, y): whether it may start the hover timer. It must be
 * at another spot than the last move seen (a button sliding under a resting pointer is not a
 * move) and the island must have settled. Every move is remembered, so the first real move after
 * settling counts.
 */
export function pageHoverMoved(gate: PageHoverGate, x: number, y: number, now: number) {
  const moved = gate.last === null || gate.last.x !== x || gate.last.y !== y;
  gate.last = { x, y };
  return moved && now >= gate.settleUntil;
}
