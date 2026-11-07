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
import { ClaudeUsageGauge } from "../../features/claude-usage/ClaudeUsageGauge";
import { CLAUDE_USAGE_GAUGE_WIDTH } from "../../features/claude-usage/usageRing";
import { useBuiltinPlugin } from "../../features/plugins/useBuiltinPlugin";
import type { AgentSessionSummary } from "../../features/agent-status/api";
import { SESSION_RING_SIZE, SessionRing } from "../../features/session-ring/SessionRing";
import { SystemGauge, systemGaugeWidth } from "../../features/system-monitor/SystemGauge";
import { SYSTEM_MONITOR_PLUGIN_ID } from "../../features/system-monitor/api";
import { sessionRingCounts } from "../../features/session-ring/ringCounts";
import { listenIslandHover } from "./api";
import type { CollapsedSlots } from "./types";

const EMPTY: CollapsedSlots = {};
const CLAUDE_USAGE_PLUGIN_ID = "focusd.claude-usage";
const SESSION_RING_PLUGIN_ID = "focusd.session-ring";

type CollapsedSlotsOptions = {
  /** Stops the center animations while the bar is not on screen. */
  paused: boolean;
  /** Agent activity the pet acts out. */
  agents: readonly AgentActivity[];
  /** The island's agent sessions and the finished ones not yet seen, for the session ring. */
  sessions: readonly AgentSessionSummary[];
  unseen: ReadonlySet<string>;
  /** The AI Agent switch: the session ring takes the blue session count's place, so only while on. */
  agentsOn: boolean;
  /** Opens the Agent page (what the blue session count does). */
  onOpenAgents: () => void;
  /** Opens the system monitor page (the system gauge's click). */
  onOpenSystem: () => void;
};

/** The status light's width, which a plugin at the left end takes over. */
const PULSE_WIDTH = 9;
/** The gap between gauges in the gauge slot (--space-sm). */
const GAUGE_GAP = 6;

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on. Slots left empty change
 * nothing on the bar. Keep the result stable (useMemo): the collapsed width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents, sessions, unseen, agentsOn, onOpenAgents, onOpenSystem }: CollapsedSlotsOptions): CollapsedSlots {
  const center = useBuiltinPlugin(CENTER_PATTERN_PLUGIN_ID);
  const usage = useBuiltinPlugin(CLAUDE_USAGE_PLUGIN_ID);
  const sessionRing = useBuiltinPlugin(SESSION_RING_PLUGIN_ID);
  const system = useBuiltinPlugin(SYSTEM_MONITOR_PLUGIN_ID);
  const systemItems = useMemo(
    () => ({
      cpu: system.settings.barCpu !== false,
      memory: system.settings.barMemory !== false,
      cpuTemperature: system.settings.barCpuTemperature !== false,
      gpuTemperature: system.settings.barGpuTemperature !== false,
    }),
    [system.settings.barCpu, system.settings.barMemory, system.settings.barCpuTemperature, system.settings.barGpuTemperature],
  );
  // The first of these set to the left end gets it; the others stay on the right.
  const candidates: [string, boolean, unknown][] = [
    [SESSION_RING_PLUGIN_ID, sessionRing.enabled && agentsOn, sessionRing.settings.position],
    [CLAUDE_USAGE_PLUGIN_ID, usage.enabled, usage.settings.position],
    [SYSTEM_MONITOR_PLUGIN_ID, system.enabled && systemGaugeWidth(systemItems) > 0, system.settings.position],
  ];
  const leftId = candidates.find(([, on, position]) => on && position === "left")?.[0];
  const mood = usePetMood(agents, center.enabled);
  const choice = useMemo(() => centerPatternChoice(center.settings), [center.settings]);
  // Read here, not in the slot, so the pet is ready whenever the slot or the title shows it.
  const sheet = usePetSheet(center.enabled ? choice.petId : null, center);
  // A tray-hidden window keeps running; stop the animations there too.
  const hidden = usePageHidden();
  const still = paused || hidden;
  return useMemo(() => {
    const slots: CollapsedSlots = {};
    const gauges: ReactNode[] = [];
    let sideWidth = 0;
    // A plugin at the left end replaces the status light; one on the right joins the gauges.
    const place = (id: string, node: ReactNode, width: number) => {
      if (id === leftId) {
        slots.left = node;
        sideWidth += width - PULSE_WIDTH;
      } else {
        gauges.push(<Fragment key={id}>{node}</Fragment>);
        sideWidth += width + (gauges.length > 1 ? GAUGE_GAP : 0);
      }
    };
    if (center.enabled) {
      const pet = typeof sheet === "string" ? sheet : null;
      slots.center = <CollapsedCenter choice={choice} sheet={sheet} mood={mood} paused={still} />;
      slots.centerWidth = pet ? CENTER_PET_WIDTH : CENTER_PATTERN_WIDTH;
      // While the bar names an agent the center is hidden, so the pet stands in for its icon.
      if (pet) slots.agentIcon = <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} />;
    }
    if (sessionRing.enabled && agentsOn) {
      // Sessions are re-read every second, so their time is close enough to now.
      const now = Date.now();
      const counts = sessionRingCounts(sessions, unseen, now);
      // Nothing to show: the blue count stays (it is empty too when no session runs).
      if (counts.total > 0) {
        const ring = <SessionRing sessions={sessions} unseen={unseen} counts={counts} now={now} onOpen={onOpenAgents} />;
        if (leftId === SESSION_RING_PLUGIN_ID) {
          slots.left = ring;
          // The blue count's place stays empty: the ring at the left end shows the count.
          slots.agentCount = null;
          sideWidth += SESSION_RING_SIZE - PULSE_WIDTH;
        } else {
          slots.agentCount = ring;
        }
      }
    }
    if (usage.enabled) place(CLAUDE_USAGE_PLUGIN_ID, <UsageGaugeSlot />, CLAUDE_USAGE_GAUGE_WIDTH - GAUGE_GAP);
    const systemWidth = systemGaugeWidth(systemItems);
    if (system.enabled && systemWidth > 0) {
      place(SYSTEM_MONITOR_PLUGIN_ID, <SystemGauge items={systemItems} paused={still} onOpen={onOpenSystem} />, systemWidth);
    }
    if (gauges.length > 0) slots.gauges = gauges;
    // The gauge slot's own gap before the next item, as CLAUDE_USAGE_GAUGE_WIDTH always counted.
    if (sideWidth !== 0) slots.sideWidth = sideWidth + (gauges.length > 0 ? GAUGE_GAP : 0);
    return Object.keys(slots).length === 0 ? EMPTY : slots;
  }, [center.enabled, usage.enabled, sessionRing.enabled, agentsOn, sessions, unseen, onOpenAgents, onOpenSystem, system.enabled, systemItems, leftId, choice, sheet, mood, still]);
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
