import { useEffect, useLayoutEffect, useRef } from "react";
import { islandIsForeground, listenIslandFocus } from "./api";

/** How often the island checks it is still in front while a plugin page holds the focus. */
const WATCH_MS = 250;

/**
 * Collapses the expanded island when the user moves to another window. The island losing the
 * keyboard focus is not enough: a plugin page (a separate WebView2 inside the island window)
 * taking it looks the same to Tauri, and clicking one used to close the island (issue #12). So
 * the island checks it is really out of front, and while a plugin page holds the focus it keeps
 * checking, until the focus comes back or another window comes to the front.
 */
export function useCollapseOnBlur(expanded: boolean, onCollapse: () => void) {
  const onCollapseRef = useRef(onCollapse);
  useLayoutEffect(() => {
    onCollapseRef.current = onCollapse;
  });

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    // Bumped by every focus change, so a check still on its way for an older one does nothing.
    let generation = 0;
    const check = (asked: number) => {
      void islandIsForeground()
        .catch(() => false)
        .then((inFront) => {
          if (cancelled || asked !== generation) return;
          if (inFront) timer = window.setTimeout(() => check(asked), WATCH_MS);
          else onCollapseRef.current();
        });
    };
    void listenIslandFocus((focused) => {
      generation += 1;
      window.clearTimeout(timer);
      if (!focused) check(generation);
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for island focus changes", error));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, [expanded]);
}
