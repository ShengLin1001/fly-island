import { useCallback, useEffect, useRef } from "react";
import type { IslandPage } from "./types";

type HoverHandlers = { onPointerEnter: () => void; onPointerLeave: () => void };

/**
 * Pointer handlers for the expanded island's page buttons that open a page once the
 * pointer rests on its button (Settings → General → Opening → Switch pages on hover).
 * `delayMs` is how long the pointer must rest there; 0 opens the page as soon as it arrives.
 * Returns an empty object for every page while the setting is off.
 */
export function usePageHoverSwitch(enabled: boolean, delayMs: number, onPageChange: (page: IslandPage) => void) {
  const timerRef = useRef<number | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  return useCallback(
    (page: IslandPage): HoverHandlers | Record<string, never> => {
      if (!enabled) return {};
      return {
        onPointerEnter: () => {
          cancel();
          if (delayMs <= 0) {
            onPageChangeRef.current(page);
            return;
          }
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            onPageChangeRef.current(page);
          }, delayMs);
        },
        onPointerLeave: cancel,
      };
    },
    [enabled, delayMs, cancel],
  );
}
