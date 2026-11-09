import { useCallback, useState } from "react";

/** Plugin ids the user starred in the market, kept on this computer only (issue #16). */
export const MARKET_FAVORITES_KEY = "focusd-island-plugin-market-favorites";

/** The saved ids; anything that is not a list of strings reads as none. */
export function loadMarketFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MARKET_FAVORITES_KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))] : [];
  } catch {
    return [];
  }
}

function saveMarketFavorites(ids: string[]) {
  if (ids.length === 0) localStorage.removeItem(MARKET_FAVORITES_KEY);
  else localStorage.setItem(MARKET_FAVORITES_KEY, JSON.stringify(ids));
}

/** The starred plugin ids and a toggle that saves at once. */
export function useMarketFavorites() {
  const [favorites, setFavorites] = useState(loadMarketFavorites);
  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      saveMarketFavorites(next);
      return next;
    });
  }, []);
  return { favorites, toggleFavorite };
}
