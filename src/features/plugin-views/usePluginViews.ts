import { useCallback, useEffect, useRef, useState } from "react";
import { listenPluginViewChanged, listPluginViews, type PluginStatusEntry, type PluginStatusItemEntry, type PluginViewEntry, type PluginViewsSnapshot } from "./api";

type Part = "views" | "status" | "statusItems";

/**
 * One part of the plugin views snapshot, read again only on the events that
 * change it: the page list when a plugin starts or stops, status texts also
 * when one is set. Keeping the two apart means a countdown on the collapsed
 * bar re-renders only the bar's chip, not the island.
 */
function usePluginViewsPart<K extends Part>(part: K): PluginViewsSnapshot[K] {
  const [value, setValue] = useState<PluginViewsSnapshot[K]>([] as PluginViewsSnapshot[K]);
  const lastText = useRef("[]");

  const refresh = useCallback(() => {
    listPluginViews()
      .then((snapshot) => {
        // Older answers (and test mocks) may lack a part: read it as empty.
        const next = snapshot[part] ?? ([] as PluginViewsSnapshot[K]);
        const text = JSON.stringify(next);
        if (text === lastText.current) return;
        lastText.current = text;
        setValue(next);
      })
      .catch((error: unknown) => console.error("Failed to list plugin views", error));
  }, [part]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    refresh();
    void listenPluginViewChanged((change) => {
      if (change.kind === "reset" || (part === "status" && change.kind === "status")) refresh();
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for plugin view changes", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [part, refresh]);

  return value;
}

/** The pages of plugins that are on, with each plugin's run state. View models are not kept here. */
export function usePluginViews(): PluginViewEntry[] {
  return usePluginViewsPart("views");
}

/** The status texts plugins set now (status.update). */
export function usePluginStatus(): PluginStatusEntry[] {
  return usePluginViewsPart("status");
}

/** Every status item the plugins that are on declare, set or not (for the collapsed bar settings). */
export function usePluginStatusItemList(): PluginStatusItemEntry[] {
  return usePluginViewsPart("statusItems");
}
