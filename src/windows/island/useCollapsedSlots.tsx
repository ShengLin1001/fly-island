import { useEffect, useMemo, useState } from "react";
import {
  AGENT_ICON_MARK_EXTRA_WIDTH,
  AGENT_ICON_PET_HEIGHT,
  CENTER_MARK_WIDTH,
  CENTER_PATTERN_PLUGIN_ID,
  CENTER_PATTERN_WIDTH,
  CENTER_PET_WIDTH,
  CenterPattern,
  CollapsedCenter,
  MARK_HEIGHT,
  PetSprite,
  centerPatternChoice,
  usePageHidden,
  usePetMood,
  usePetSheet,
  type AgentActivity,
} from "../../features/center-pattern";
import { ClaudeUsageGauge } from "../../features/claude-usage/ClaudeUsageGauge";
import { CLAUDE_USAGE_GAUGE_WIDTH, shownUsageProviders, usageItemId, type UsageProvider } from "../../features/claude-usage/usageRing";
import { useBuiltinPlugin } from "../../features/plugins/useBuiltinPlugin";
import type { AgentSessionSummary } from "../../features/agent-status/api";
import { SESSION_RING_STYLES, SessionRing, type SessionRingStyle } from "../../features/session-ring/SessionRing";
import { sessionRingCounts } from "../../features/session-ring/ringCounts";
import { isCollapsedItemHidden } from "../../features/appearance/collapsedItems";
import { useCollapsedPlacements } from "../../features/appearance/useCollapsedPlacements";
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
  /** The sessions the Agent page lists (its filters applied) and the turns not yet seen, for the session ring. */
  sessions: readonly AgentSessionSummary[];
  unseen: ReadonlySet<string>;
  /** The AI Agent switch: the session ring takes the blue session count's place, so only while on. */
  agentsOn: boolean;
  /** Opens the Agent page (what the blue session count does). */
  onOpenAgents: () => void;
};

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on. Slots left empty change
 * nothing on the bar. Keep the result stable (useMemo): the collapsed width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents, sessions, unseen, agentsOn, onOpenAgents }: CollapsedSlotsOptions): CollapsedSlots {
  const center = useBuiltinPlugin(CENTER_PATTERN_PLUGIN_ID);
  const usage = useBuiltinPlugin(CLAUDE_USAGE_PLUGIN_ID);
  const sessionRing = useBuiltinPlugin(SESSION_RING_PLUGIN_ID);
  const showRemaining = usage.settings.show === "remaining";
  const ringStyle = SESSION_RING_STYLES.find((known) => known === sessionRing.settings.style) ?? ("ring" satisfies SessionRingStyle);
  const ringCount = sessionRing.settings.showCount !== false;
  const { placements } = useCollapsedPlacements();
  // A ring hidden on the bar (Appearance > Collapsed bar) is not drawn and takes no width.
  const providers = useMemo(
    () => shownUsageProviders(usage.settings).filter((provider) => !isCollapsedItemHidden(placements, usageItemId(provider))),
    [usage.settings, placements],
  );
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
      const mark = choice.pattern === "mark";
      slots.centerWidth = pet ? CENTER_PET_WIDTH : mark ? CENTER_MARK_WIDTH : CENTER_PATTERN_WIDTH;
      // While the bar names an agent the center is hidden, so the pet or the mark stands in for its icon.
      if (pet) slots.agentIcon = <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} />;
      else if (mark) {
        slots.agentIcon = <CenterPattern pattern="mark" mood={mood} paused={still} height={MARK_HEIGHT} />;
        slots.agentIconWidth = AGENT_ICON_MARK_EXTRA_WIDTH;
      }
    }
    if (sessionRing.enabled && agentsOn) {
      const counts = sessionRingCounts(sessions, unseen);
      // Nothing to show: the blue count stays (it is empty too when no session runs).
      if (counts.total > 0) {
        slots.agentCount = (
          <SessionRing sessions={sessions} unseen={unseen} counts={counts} style={ringStyle} showCount={ringCount} paused={still} onOpen={onOpenAgents} />
        );
      }
    }
    // One ring per agent switched on, in USAGE_PROVIDERS order; all off leaves the bar as it is.
    if (usage.enabled && providers.length > 0) {
      slots.gauges = providers.map((provider) => ({ id: usageItemId(provider), node: <UsageGaugeSlot key={provider.id} providers={[provider]} showRemaining={showRemaining} /> }));
      slots.sideWidth = providers.length * CLAUDE_USAGE_GAUGE_WIDTH;
    }
    return Object.keys(slots).length === 0 ? EMPTY : slots;
  }, [center.enabled, usage.enabled, providers, showRemaining, sessionRing.enabled, ringStyle, ringCount, agentsOn, sessions, unseen, onOpenAgents, choice, sheet, mood, still]);
}

/** Follows the native island hover here, so the slots above stay the same object. */
function UsageGaugeSlot({ providers, showRemaining }: { providers: readonly UsageProvider[]; showRemaining: boolean }) {
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
  return providers.map((provider) => <ClaudeUsageGauge key={provider.id} provider={provider} islandHovered={hovered} showRemaining={showRemaining} />);
}
