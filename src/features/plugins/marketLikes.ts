import { useEffect, useState } from "react";
import { getPluginMarketLikes, type MarketLikes } from "./market-likes/api.ts";

export type { MarketLike, MarketLikes } from "./market-likes/api.ts";

/** How the market lists plugins inside each group. */
export type MarketSort = "index" | "likes";

/** The likes, read again whenever the index was (`loadedAt` changes); none while they cannot be read. */
export function useMarketLikes(loadedAt: number | null) {
  const [likes, setLikes] = useState<MarketLikes>({});
  useEffect(() => {
    let cancelled = false;
    getPluginMarketLikes()
      .then((next) => { if (!cancelled) setLikes(next); })
      .catch(() => { /* Only shown: the market works the same without them. */ });
    return () => { cancelled = true; };
  }, [loadedAt]);
  return likes;
}

/** `plugins` in index order, or most liked first (index order among equals). */
export function sortMarketPlugins<T extends { id: string }>(plugins: readonly T[], sort: MarketSort, likes: MarketLikes): T[] {
  if (sort === "index") return [...plugins];
  return plugins
    .map((plugin, index) => ({ plugin, index, count: likes[plugin.id]?.count ?? 0 }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .map(({ plugin }) => plugin);
}
