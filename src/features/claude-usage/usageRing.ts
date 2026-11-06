import type { ClaudeUsage, ClaudeUsageWindow } from "./api";
import type { ClaudeUsageText } from "../../i18n/sections/claudeUsage";

/** Older numbers turn the ring grey. */
export const USAGE_STALE_MS = 15 * 60_000;

export const USAGE_COLORS = {
  normal: "#E5A385",
  warn: "#E5C890",
  danger: "#E78284",
  stale: "#8E8E93",
} as const;

/** Keeps `current` when `next` carries older numbers (a late reply racing a pushed snapshot). */
export function newerUsage(current: ClaudeUsage, next: ClaudeUsage) {
  if (current.updatedAt !== null && next.updatedAt !== null && next.updatedAt < current.updatedAt) return current;
  if (current.updatedAt !== null && next.updatedAt === null) return current;
  return next;
}

/** Stale when there are no numbers, the last refresh failed, or they are over 15 minutes old. */
export function isUsageStale(usage: ClaudeUsage, now: number) {
  return usage.updatedAt === null || usage.error !== null || now - usage.updatedAt > USAGE_STALE_MS;
}

export function usageColor(percent: number, stale: boolean) {
  if (stale) return USAGE_COLORS.stale;
  if (percent >= 90) return USAGE_COLORS.danger;
  if (percent >= 70) return USAGE_COLORS.warn;
  return USAGE_COLORS.normal;
}

function resetText(limit: ClaudeUsageWindow, now: number, text: ClaudeUsageText) {
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN;
  if (Number.isNaN(resetsAt)) return null;
  const totalMinutes = Math.floor((resetsAt - now) / 60_000);
  if (totalMinutes < 1) return text.resettingSoon;
  return text.resetsIn({
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  });
}

/** Tooltip lines: each window, then where and when the numbers came from or why they are old. */
export function usageTooltipLines(usage: ClaudeUsage, now: number, text: ClaudeUsageText) {
  const lines: string[] = [];
  for (const [label, limit] of [
    [text.fiveHour, usage.fiveHour],
    [text.sevenDay, usage.sevenDay],
  ] as const) {
    if (limit) lines.push(text.window(label, Math.round(limit.percent), resetText(limit, now, text)));
  }
  if (lines.length === 0) lines.push(text.noData);
  if (usage.error) lines.push(text.errors[usage.error.kind]);
  if (usage.updatedAt !== null && isUsageStale(usage, now)) {
    lines.push(text.updatedAgo(Math.max(0, Math.floor((now - usage.updatedAt) / 60_000))));
  }
  if (usage.source === "hud") lines.push(text.fromHud);
  return lines;
}
