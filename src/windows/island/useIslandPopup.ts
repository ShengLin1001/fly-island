import { useState } from "react";
import { EXPANDED_ISLAND_WIDTH, POPUP_ISLAND_WIDTH } from "./layout";
import type { IslandMode } from "./types";

/**
 * Whether the expanded island is a popup (C11b): new messages, or an Agent alert, opened by
 * themselves, show only their card on a narrower island without the page header. The popup ends
 * the moment the island starts to close, so the island keeps the popup's shape while it collapses
 * instead of flashing the header and the full width on the way.
 */
export function useIslandPopup(mode: IslandMode, showsCard: boolean) {
  const [kept, setKept] = useState(showsCard);
  if (mode === "expanded" && kept !== showsCard) setKept(showsCard);
  const popup = mode === "expanded" ? showsCard : kept;
  return { popup, expandedIslandWidth: popup ? POPUP_ISLAND_WIDTH : EXPANDED_ISLAND_WIDTH };
}
