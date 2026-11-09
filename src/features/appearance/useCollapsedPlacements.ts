import { useCallback, useEffect, useState } from "react";
import { COLLAPSED_ITEMS_KEY, loadCollapsedPlacements, saveCollapsedPlacements, type CollapsedPlacement } from "./collapsedItems.ts";

/**
 * The saved order of the collapsed bar's items. The settings window writes it;
 * the island follows through the `storage` event, as with the plugin page order.
 */
export function useCollapsedPlacements() {
  const [placements, setPlacements] = useState<CollapsedPlacement[]>(loadCollapsedPlacements);
  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key === COLLAPSED_ITEMS_KEY || event.key === null) setPlacements(loadCollapsedPlacements());
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, []);
  const save = useCallback((next: CollapsedPlacement[]) => {
    saveCollapsedPlacements(next);
    setPlacements(next);
  }, []);
  return { placements, save };
}
