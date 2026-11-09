import type { PluginStatusEntry } from "./api";

/**
 * The plugin statuses the collapsed bar shows, each as its own item: the ones
 * with a text, highest priority first, and of equal ones the first plugin (in the
 * island's plugin order). The user's order of the bar's items comes on top.
 */
export function shownStatusEntries(entries: readonly PluginStatusEntry[]): PluginStatusEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.text)
    .sort((left, right) => right.entry.priority - left.entry.priority || left.index - right.index)
    .map(({ entry }) => entry);
}
