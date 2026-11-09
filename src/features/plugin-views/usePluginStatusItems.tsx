import { useMemo, type ReactNode } from "react";
import type { PluginViewEntry } from "./api";
import { pluginPageId } from "./model";
import { PluginStatusChip } from "./PluginStatusChip";
import { shownStatusEntries } from "./statusItems";
import { usePluginStatus } from "./usePluginViews";

/** The collapsed bar item of one plugin status item (contributes.statusItems). */
export const pluginStatusItemId = (pluginId: string, itemId: string) => `plugin:${pluginId}/${itemId}`;

/**
 * Each plugin status that has a text now, as a collapsed bar item, highest
 * priority first (by default the bar lists them in this order). Call it in the
 * bar itself: it listens for status changes, so a ticking countdown re-renders
 * the bar and not the island.
 */
export function usePluginStatusItems(
  /** The plugin pages shown on the island; a click opens the status plugin's first one. */
  views: readonly PluginViewEntry[],
  onOpen: (page: `plugin:${string}`) => void,
): { id: string; node: ReactNode }[] {
  const status = usePluginStatus();
  return useMemo(
    () =>
      shownStatusEntries(status).map((entry) => {
        const view = views.find((candidate) => candidate.pluginId === entry.pluginId);
        const page = view ? pluginPageId(view.pluginId, view.viewId) : null;
        return {
          id: pluginStatusItemId(entry.pluginId, entry.itemId),
          node: <PluginStatusChip status={entry} onOpen={page ? () => onOpen(page) : null} />,
        };
      }),
    [status, views, onOpen],
  );
}
