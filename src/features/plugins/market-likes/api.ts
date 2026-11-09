import { invoke } from "@tauri-apps/api/core";

/**
 * Likes on the market cards (issue #16): the 👍 on each plugin's discussion in
 * TixXin/focusd-plugins, counted every hour into stars.json. Mirrored by
 * `MarketLike` in src-tauri/src/plugin_host/market_likes.rs.
 */
export type MarketLike = { count: number; url: string };
export type MarketLikes = Record<string, MarketLike>;

/** The likes per plugin id; empty while stars.json does not exist. */
export function getPluginMarketLikes() {
  return invoke<MarketLikes>("get_plugin_market_likes");
}
