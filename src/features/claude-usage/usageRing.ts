import type { AgentUsage, UsageWindow } from "../agent-status/api";
import { untilReset, usageSourceLines } from "../agent-status/usage.ts";
import type { HoverCardLine } from "../../components/IslandHoverCard";
import type { MiniRingTrack } from "../../components/MiniRing";
import type { ClaudeUsageText } from "../../i18n/sections/claudeUsage";

/** The ring's size: the session ring's, so the two match on the bar. */
export const CLAUDE_USAGE_RING_SIZE = 24;
/** Ring size plus the gauge slot's gap, for the collapsed width (CollapsedSlots.sideWidth). */
export const CLAUDE_USAGE_GAUGE_WIDTH = CLAUDE_USAGE_RING_SIZE + 6;

/** Older numbers turn the ring grey (the Agent page's usage line uses the same age). */
export const USAGE_STALE_MS = 15 * 60_000;

export const USAGE_COLORS = {
  normal: "#E5A385",
  warn: "#E5C890",
  danger: "#E78284",
  stale: "#8E8E93",
} as const;

export type UsageProviderId = "claudeCode" | "codex" | "glm" | "kimi";

/**
 * The agents the usage plugin can put on the bar, in bar order, each with its own colour while
 * under 70%: Claude's orange, OpenAI's black-and-white as a near white for Codex, the blue-violet
 * of Zhipu's mark for GLM and Kimi's brand blue. `id` is also the plugin's on/off setting.
 */
export const USAGE_PROVIDERS: readonly { id: UsageProviderId; name: string; color: string; defaultOn: boolean }[] = [
  { id: "claudeCode", name: "Claude Code", color: USAGE_COLORS.normal, defaultOn: true },
  { id: "codex", name: "Codex", color: "#E6E6EB", defaultOn: false },
  { id: "glm", name: "GLM", color: "#8B7BFF", defaultOn: false },
  { id: "kimi", name: "Kimi", color: "#3A8DFF", defaultOn: false },
];

export type UsageProvider = (typeof USAGE_PROVIDERS)[number];

/** The providers switched on in the plugin's settings; an unset switch takes its default. */
export function shownUsageProviders(settings: Record<string, unknown>): UsageProvider[] {
  return USAGE_PROVIDERS.filter(({ id, defaultOn }) => (typeof settings[id] === "boolean" ? settings[id] : defaultOn));
}

/**
 * Grey when there is no snapshot or it is over 15 minutes old. A snapshot without a write time
 * counts as current, as on the Agent page.
 */
export function isUsageStale(usage: AgentUsage | null, now: number) {
  return usage === null || (usage.updatedAt !== null && now - usage.updatedAt > USAGE_STALE_MS);
}

/** The provider's colour (Claude's by default) until 70% is used, then the shared warning colours. */
export function usageColor(percent: number, stale: boolean, normal: string = USAGE_COLORS.normal) {
  if (stale) return USAGE_COLORS.stale;
  if (percent >= 90) return USAGE_COLORS.danger;
  if (percent >= 70) return USAGE_COLORS.warn;
  return normal;
}

/** The percent the ring and card show: what is used, or with `remaining` what is left. */
export function shownPercent(used: number, remaining: boolean) {
  return remaining ? Math.max(0, 100 - used) : used;
}

/** The inner ring's window: the week, or the month for plans that have no weekly limit (Kimi's newer ones). */
function longWindow(usage: AgentUsage | null) {
  return usage?.sevenDay ?? usage?.models.find((window) => window.name === "month") ?? null;
}

/**
 * Outer ring 5 hours, inner 7 days (or the month); a missing window is a bare track. With
 * `remaining` the rings fill with what is left; the colour still warns by what is used.
 */
export function usageRings(usage: AgentUsage | null, now: number, remaining = false, normal: string = USAGE_COLORS.normal): MiniRingTrack[] {
  const stale = isUsageStale(usage, now);
  return [usage?.fiveHour ?? null, longWindow(usage)].map((limit) =>
    limit
      ? { value: shownPercent(limit.used, remaining) / 100, color: usageColor(limit.used, stale, normal) }
      : { value: 0, color: USAGE_COLORS.stale },
  );
}

function resetText(limit: UsageWindow, now: number, text: ClaudeUsageText) {
  if (limit.resetsAt === null) return null;
  const parts = untilReset(limit.resetsAt, now);
  return parts ? text.resetsIn(parts) : text.resettingSoon;
}

/**
 * The hover card: with `provider` (the bar's rings always pass it) first its name and plan in
 * its colour; then each window with its ring colour, named windows (a month, a model) after the
 * 5-hour and 7-day ones; why asking failed (the numbers stay coloured while fresh), then how
 * old the numbers are and where they come from.
 */
export function usageCardLines(
  usage: AgentUsage | null,
  now: number,
  text: ClaudeUsageText,
  remaining = false,
  provider?: UsageProvider,
): HoverCardLine[] {
  const title: HoverCardLine[] = provider ? [{ text: [provider.name, usage?.plan].filter(Boolean).join(" · "), color: provider.color }] : [];
  const noData = provider && provider.id !== "claudeCode" ? text.noUsage[provider.id] : text.noData;
  if (!usage) return [...title, { text: noData, muted: true }];
  const stale = isUsageStale(usage, now);
  const lines: HoverCardLine[] = [];
  const named = usage.models.map((window) => [text.windowNames[window.name] ?? window.name, window] as const);
  for (const [label, limit] of [[text.fiveHour, usage.fiveHour], [text.sevenDay, usage.sevenDay], ...named] as const) {
    if (limit) {
      const percent = Math.round(shownPercent(limit.used, remaining));
      const format = remaining ? text.windowLeft : text.window;
      lines.push({ text: format(label, percent, resetText(limit, now, text)), color: usageColor(limit.used, stale, provider?.color) });
    }
  }
  const hasNumbers = lines.length > 0;
  if (!hasNumbers) lines.push({ text: noData, muted: true });
  // Without numbers their age says nothing; the failure reason still does.
  lines.push(...usageSourceLines(hasNumbers ? usage : { ...usage, updatedAt: null }, now, text));
  return [...title, ...lines];
}
