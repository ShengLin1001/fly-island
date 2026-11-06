import type { ClaudeUsage, ClaudeUsageWindow } from "./api";
import type { HoverCardLine } from "../../components/IslandHoverCard";
import type { MiniRingTrack } from "../../components/MiniRing";
import type { ClaudeUsageText } from "../../i18n/sections/claudeUsage";

/** Ring size plus the gauge slot's gap, for the collapsed width (CollapsedSlots.sideWidth). */
export const CLAUDE_USAGE_GAUGE_WIDTH = 20 + 6;

/** Older numbers turn the ring grey. */
export const USAGE_STALE_MS = 15 * 60_000;

export const USAGE_COLORS = {
  normal: "#E5A385",
  warn: "#E5C890",
  danger: "#E78284",
  stale: "#8E8E93",
} as const;

/** Keeps `current` when `next` is an older snapshot (a late reply racing a pushed one). */
export function newerUsage(current: ClaudeUsage, next: ClaudeUsage) {
  return next.revision < current.revision ? current : next;
}

/**
 * Grey when there are no numbers yet or they are over 15 minutes old. A failed refresh alone does
 * not grey the ring: the card names the reason while the numbers are still fresh.
 */
export function isUsageStale(usage: ClaudeUsage, now: number) {
  return usage.updatedAt === null || now - usage.updatedAt > USAGE_STALE_MS;
}

export function usageColor(percent: number, stale: boolean) {
  if (stale) return USAGE_COLORS.stale;
  if (percent >= 90) return USAGE_COLORS.danger;
  if (percent >= 70) return USAGE_COLORS.warn;
  return USAGE_COLORS.normal;
}

/** Outer ring 5 hours, inner 7 days; a missing window is a bare track. */
export function usageRings(usage: ClaudeUsage, now: number): MiniRingTrack[] {
  const stale = isUsageStale(usage, now);
  return [usage.fiveHour, usage.sevenDay].map((limit) =>
    limit ? { value: limit.percent / 100, color: usageColor(limit.percent, stale) } : { value: 0, color: USAGE_COLORS.stale },
  );
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

/** The hover card: each window with its ring colour, the failure reason, then when and from where. */
export function usageCardLines(usage: ClaudeUsage, now: number, text: ClaudeUsageText): HoverCardLine[] {
  const stale = isUsageStale(usage, now);
  const lines: HoverCardLine[] = [];
  for (const [label, limit] of [
    [text.fiveHour, usage.fiveHour],
    [text.sevenDay, usage.sevenDay],
  ] as const) {
    if (limit) {
      const percent = Math.round(limit.percent);
      lines.push({ text: text.window(label, percent, resetText(limit, now, text)), color: usageColor(limit.percent, stale) });
    }
  }
  if (lines.length === 0) lines.push({ text: text.noData, muted: true });
  if (usage.error) lines.push({ text: text.errors[usage.error.kind] });
  if (usage.updatedAt !== null) {
    const minutes = Math.max(0, Math.floor((now - usage.updatedAt) / 60_000));
    lines.push({ text: text.updated(text.updatedAgo(minutes), usage.source === "hud" ? text.fromHud : text.fromApi), muted: true });
  }
  return lines;
}
