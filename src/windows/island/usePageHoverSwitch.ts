import { useCallback, useEffect, useRef } from "react";
import type { IslandPage } from "./types";

/** How long the pointer rests on a page button before its page opens, so sweeping across the row opens nothing. */
const HOVER_SWITCH_DELAY_MS = 150;

type HoverHandlers = { onPointerEnter: () => void; onPointerLeave: () => void };

/**
 * Pointer handlers for the expanded island's page buttons that open a page once the
 * pointer rests on its button (Settings → General → Opening → Switch pages on hover).
 * Returns an empty object for every page while the setting is off.
 */
export function usePageHoverSwitch(enabled: boolean, onPageChange: (page: IslandPage) => void) {
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
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            onPageChangeRef.current(page);
          }, HOVER_SWITCH_DELAY_MS);
        },
        onPointerLeave: cancel,
      };
    },
    [enabled, cancel],
  );
}
