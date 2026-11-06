import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AGENT_ICON_PET_HEIGHT,
  CENTER_PATTERN_PLUGIN_ID,
  CENTER_PATTERN_WIDTH,
  CENTER_PET_WIDTH,
  CollapsedCenter,
  PetSprite,
  centerPatternChoice,
  usePageHidden,
  usePetMood,
  usePetSheet,
  type AgentActivity,
} from "../../features/center-pattern";
import { ClaudeSessionRing, SESSION_RING_SIZE } from "../../features/claude-sessions/ClaudeSessionRing";
import { useClaudeSessions } from "../../features/claude-sessions/useClaudeSessions";
import { ClaudeUsageGauge } from "../../features/claude-usage/ClaudeUsageGauge";
import { CLAUDE_USAGE_GAUGE_WIDTH } from "../../features/claude-usage/usageRing";
import { useBuiltinPlugin } from "../../features/plugins/useBuiltinPlugin";
import { listenIslandHover } from "./api";
import type { CollapsedSlots } from "./types";

const EMPTY: CollapsedSlots = {};
const CLAUDE_USAGE_PLUGIN_ID = "focusd.claude-usage";
const CLAUDE_SESSIONS_PLUGIN_ID = "focusd.claude-sessions";
// .island__gauge-slot's gap (--space-sm) before the item on its right.
const GAUGE_GAP = 6;

/** One gauge: what it draws and the px it needs. Gauges show in this list's order. */
type Gauge = { key: string; node: ReactNode; width: number };

type CollapsedSlotsOptions = {
  /** Stops the center animations while the bar is not on screen. */
  paused: boolean;
  /** Agent activity the pet acts out. */
  agents: readonly AgentActivity[];
  /** The AI Agent switch: on, the session ring takes the blue session count's place. */
  agentsOn: boolean;
  /** Opens the Agent page (what the blue session count did). */
  onOpenAgents: () => void;
};

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on. Slots left empty change
 * nothing on the bar. Keep the result stable (useMemo): the collapsed width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents, agentsOn, onOpenAgents }: CollapsedSlotsOptions): CollapsedSlots {
  const center = useBuiltinPlugin(CENTER_PATTERN_PLUGIN_ID);
  const usage = useBuiltinPlugin(CLAUDE_USAGE_PLUGIN_ID);
  const sessionsPlugin = useBuiltinPlugin(CLAUDE_SESSIONS_PLUGIN_ID);
  const sessions = useClaudeSessions(sessionsPlugin.enabled);
  const mood = usePetMood(agents, center.enabled);
  const choice = useMemo(() => centerPatternChoice(center.settings), [center.settings]);
  // Read here, not in the slot, so the pet is ready whenever the slot or the title shows it.
  const sheet = usePetSheet(center.enabled ? choice.petId : null, center);
  // A tray-hidden window keeps running; stop the animations there too.
  const hidden = usePageHidden();
  const still = paused || hidden;

  return useMemo(() => {
    const slots: CollapsedSlots = {};
    if (center.enabled) {
      const pet = typeof sheet === "string" ? sheet : null;
      slots.center = <CollapsedCenter choice={choice} sheet={sheet} mood={mood} paused={still} />;
      slots.centerWidth = pet ? CENTER_PET_WIDTH : CENTER_PATTERN_WIDTH;
      // While the bar names an agent the center is hidden, so the pet stands in for its icon.
      if (pet) slots.agentIcon = <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} />;
    }

    const gauges: Gauge[] = [];
    // Holds the blue count's place until the first read, so it does not flash before the ring.
    if (sessionsPlugin.enabled && sessions === null && agentsOn) slots.agentCount = <></>;
    // No claude-sessions or no active session: no ring, and the blue count (fly-island's own
    // sessions, Codex included) shows as before.
    if (sessionsPlugin.enabled && sessions?.detected && sessions.counts.total > 0) {
      const ring = <ClaudeSessionRing snapshot={sessions} onOpen={agentsOn ? onOpenAgents : undefined} />;
      if (agentsOn) slots.agentCount = ring;
      else gauges.push({ key: "claude-sessions", node: ring, width: SESSION_RING_SIZE + GAUGE_GAP });
    }
    if (usage.enabled) gauges.push({ key: "claude-usage", node: <UsageGaugeSlot />, width: CLAUDE_USAGE_GAUGE_WIDTH });
    if (gauges.length > 0) {
      slots.gauges = gauges.map((gauge) => <Fragment key={gauge.key}>{gauge.node}</Fragment>);
      // The session ring in agentCount is as wide as the count it replaces, so only gauges widen the bar.
      slots.sideWidth = gauges.reduce((sum, gauge) => sum + gauge.width, 0);
    }
    return Object.keys(slots).length === 0 ? EMPTY : slots;
  }, [center.enabled, usage.enabled, sessionsPlugin.enabled, sessions, agentsOn, onOpenAgents, choice, sheet, mood, still]);
}

/** Follows the native island hover here, so the slots above stay the same object. */
function UsageGaugeSlot() {
  const [hovered, setHovered] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listenIslandHover(setHovered)
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for island hover", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  return <ClaudeUsageGauge islandHovered={hovered} />;
}
