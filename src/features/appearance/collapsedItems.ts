/**
 * The order of the icons on the collapsed bar (C12, issue #17; plan in
 * docs/architecture/collapsed-bar-items.md). Every icon that stays on the bar has
 * an id; the user puts each on the left or the right of the summary, in an order,
 * or hides it. Only what the user arranged is saved; everything else takes its
 * default place, which is the layout the bar had before this existed.
 */
export type CollapsedZone = "left" | "right";
export type CollapsedPlacement = { id: string; zone: CollapsedZone; hidden?: boolean };

export const COLLAPSED_ITEMS_KEY = "focusd-island-collapsed-items";
const LAYOUT_VERSION = 1;

/**
 * Default places, left to right. An entry ending in ":" stands for every id with
 * that prefix (each provider's usage ring, each plugin status item), in the order
 * they are offered.
 */
const DEFAULT_ORDER: readonly { id: string; zone: CollapsedZone }[] = [
  { id: "status-light", zone: "left" },
  { id: "mail", zone: "right" },
  { id: "update", zone: "right" },
  { id: "plugin:", zone: "right" },
  { id: "device-use", zone: "right" },
  { id: "shelf", zone: "right" },
  { id: "music", zone: "right" },
  { id: "usage:", zone: "right" },
  { id: "session-count", zone: "right" },
];

function defaultSlot(id: string) {
  const index = DEFAULT_ORDER.findIndex((entry) => (entry.id.endsWith(":") ? id.startsWith(entry.id) : entry.id === id));
  // Unknown ids go to the right, after everything known.
  return index < 0 ? { rank: DEFAULT_ORDER.length, zone: "right" as const } : { rank: index, zone: DEFAULT_ORDER[index].zone };
}

const isPlacement = (value: unknown): value is CollapsedPlacement =>
  typeof value === "object" && value !== null
  && typeof (value as CollapsedPlacement).id === "string"
  && ((value as CollapsedPlacement).zone === "left" || (value as CollapsedPlacement).zone === "right");

/** The saved placements; anything unreadable reads as none, which is the default layout. */
export function loadCollapsedPlacements(): CollapsedPlacement[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(COLLAPSED_ITEMS_KEY) ?? "null");
    if (typeof value !== "object" || value === null || (value as { version?: unknown }).version !== LAYOUT_VERSION) return [];
    const items = (value as { items?: unknown }).items;
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.filter(isPlacement).filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
      .map(({ id, zone, hidden }) => (hidden ? { id, zone, hidden: true } : { id, zone }));
  } catch {
    return [];
  }
}

/** Saves the placements; an empty list removes the key, which is the default layout. */
export function saveCollapsedPlacements(placements: readonly CollapsedPlacement[]) {
  if (placements.length === 0) localStorage.removeItem(COLLAPSED_ITEMS_KEY);
  else localStorage.setItem(COLLAPSED_ITEMS_KEY, JSON.stringify({ version: LAYOUT_VERSION, items: placements }));
}

/**
 * Every id in `offered` placed: the saved ones where they were saved, the rest
 * right after the item of their default zone that comes closest before them by
 * default (first in the zone when none does). Saved ids not offered now (a plugin
 * switched off) stay in the result, so they come back to the same place.
 */
export function arrangeCollapsedItems(offered: readonly string[], saved: readonly CollapsedPlacement[]): CollapsedPlacement[] {
  const result = [...saved];
  const known = new Set(saved.map(({ id }) => id));
  for (const id of offered) {
    if (known.has(id)) continue;
    known.add(id);
    const { rank, zone } = defaultSlot(id);
    let after = -1;
    let afterRank = -1;
    result.forEach((placement, index) => {
      const other = defaultSlot(placement.id).rank;
      if (placement.zone === zone && other <= rank && other >= afterRank) [after, afterRank] = [index, other];
    });
    const firstOfZone = result.findIndex((placement) => placement.zone === zone);
    const at = after >= 0 ? after + 1 : firstOfZone >= 0 ? firstOfZone : zone === "left" ? 0 : result.length;
    result.splice(at, 0, { id, zone });
  }
  return result;
}

/** The ids shown in `zone`, in order: placed there, not hidden, and offered now. */
export function zoneIds(placements: readonly CollapsedPlacement[], zone: CollapsedZone, offered: readonly string[]) {
  const present = new Set(offered);
  return placements.filter((placement) => placement.zone === zone && !placement.hidden && present.has(placement.id)).map(({ id }) => id);
}

/** Whether `id` is hidden. */
export function isCollapsedItemHidden(placements: readonly CollapsedPlacement[], id: string) {
  return placements.some((placement) => placement.id === id && placement.hidden);
}

/**
 * Moves `id` one step up (-1) or down (+1) among the items of its zone that are
 * `listed` (what the settings show), skipping the ones not offered now.
 */
export function moveCollapsedItem(placements: readonly CollapsedPlacement[], id: string, step: -1 | 1, listed: readonly string[]) {
  const index = placements.findIndex((placement) => placement.id === id);
  if (index < 0) return [...placements];
  const shown = new Set(listed);
  const zone = placements[index].zone;
  let target = index + step;
  while (target >= 0 && target < placements.length && (placements[target].zone !== zone || !shown.has(placements[target].id))) target += step;
  if (target < 0 || target >= placements.length) return [...placements];
  const next = [...placements];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Puts `id` at the end of `zone`. */
export function setCollapsedItemZone(placements: readonly CollapsedPlacement[], id: string, zone: CollapsedZone) {
  const item = placements.find((placement) => placement.id === id);
  if (!item || item.zone === zone) return [...placements];
  const rest = placements.filter((placement) => placement.id !== id);
  const lastOfZone = rest.map((placement) => placement.zone).lastIndexOf(zone);
  const at = lastOfZone >= 0 ? lastOfZone + 1 : zone === "left" ? 0 : rest.length;
  rest.splice(at, 0, { ...item, zone });
  return rest;
}

export function setCollapsedItemHidden(placements: readonly CollapsedPlacement[], id: string, hidden: boolean) {
  return placements.map((placement) => (placement.id !== id ? placement : hidden ? { ...placement, hidden: true } : { id: placement.id, zone: placement.zone }));
}
