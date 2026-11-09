import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { createPageHoverGate, pageHoverMoved, settlePageHover } from "./pageHoverGate";
import type { IslandPage } from "./types";

type HoverHandlers = { onPointerMove: (event: PointerEvent) => void; onPointerLeave: () => void };

// One for the header's buttons and the plugin page buttons together: the pointer is the same.
const gate = createPageHoverGate();

/**
 * Pointer handlers for the expanded island's page buttons that open a page once the
 * pointer rests on its button (Settings → General → Opening → Switch pages on hover).
 * `delayMs` is how long the pointer must rest there; 0 opens the page as soon as it arrives.
 * Only a pointer that really moves onto a button counts, and not while the island is resizing
 * after `page` changed (pageHoverGate.ts), so pages of different widths cannot switch back and
 * forth under a resting pointer. Returns an empty object for every page while the setting is off.
 */
export function usePageHoverSwitch(enabled: boolean, delayMs: number, page: IslandPage, onPageChange: (page: IslandPage) => void) {
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<IslandPage | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  // Any page change (hover, click, shortcut) moves the buttons while the island resizes.
  useEffect(() => {
    cancel();
    settlePageHover(gate, performance.now());
  }, [page, cancel]);

  return useCallback(
    (target: IslandPage): HoverHandlers | Record<string, never> => {
      if (!enabled) return {};
      return {
        onPointerMove: (event) => {
          if (!pageHoverMoved(gate, event.clientX, event.clientY, performance.now())) return;
          // Moving on within the same button does not start the wait again.
          if (pendingRef.current === target) return;
          cancel();
          if (delayMs <= 0) {
            onPageChangeRef.current(target);
            return;
          }
          pendingRef.current = target;
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            pendingRef.current = null;
            onPageChangeRef.current(target);
          }, delayMs);
        },
        onPointerLeave: cancel,
      };
    },
    [enabled, delayMs, cancel],
  );
}
