import { useEffect, useMemo, useState } from "react";
import {
  AGENT_ICON_PET_HEIGHT,
  CENTER_PATTERN_PLUGIN_ID,
  CenterPattern,
  CollapsedCenter,
  MARK_HEIGHT,
  MARK_WIDTH,
  PetSprite,
  agentIconMarkExtraWidth,
  centerHeight,
  centerPatternChoice,
  centerPatternSize,
  centerWidth,
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
  /** Settings > AI Agent: the status light is the island mark instead of the dot. */
  markLight: boolean;
};

// The mark in the status light's place is that much wider than the 9 px dot.
const MARK_LIGHT_EXTRA_WIDTH = MARK_WIDTH - 9;

/**
 * The one place built-in plugins plug into the collapsed bar. Each plugin reads its own state
 * with useBuiltinPlugin(id) and fills a slot only while it is on. Slots left empty change
 * nothing on the bar. Keep the result stable (useMemo): the collapsed width is worked out from it.
 */
export function useCollapsedSlots({ paused, agents, sessions, unseen, agentsOn, onOpenAgents, markLight }: CollapsedSlotsOptions): CollapsedSlots {
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
  const lightShown = markLight && !isCollapsedItemHidden(placements, "status-light");
  const mood = usePetMood(agents, center.enabled || lightShown);
  const choice = useMemo(() => centerPatternChoice(center.settings), [center.settings]);
  const size = centerPatternSize(center.settings);
  // Read here, not in the slot, so the pet is ready whenever the slot or the title shows it.
  const sheet = usePetSheet(center.enabled ? choice.petId : null, center);
  // A tray-hidden window keeps running; stop the animations there too.
  const hidden = usePageHidden();
  const still = paused || hidden;
  return useMemo(() => {
    const slots: CollapsedSlots = {};
    if (center.enabled) {
      const pet = typeof sheet === "string" ? sheet : null;
      slots.center = <CollapsedCenter choice={choice} sheet={sheet} mood={mood} paused={still} size={size} />;
      const mark = choice.pattern === "mark";
      // A pet still loading or unreadable is sized as the eyes it falls back to.
      slots.centerWidth = centerWidth(pet ? "pet" : choice.pattern === "pet" ? "eyes" : choice.pattern, size);
      // While the bar names an agent the center is hidden, so the pet or the mark stands in for its
      // icon; not a second mark next to the one in the light's place.
      if (pet) slots.agentIcon = <PetSprite src={pet} mood={mood} paused={still} height={AGENT_ICON_PET_HEIGHT} />;
      else if (mark && !lightShown) {
        slots.agentIcon = <CenterPattern pattern="mark" mood={mood} paused={still} height={centerHeight("mark", size)} />;
        slots.agentIconWidth = agentIconMarkExtraWidth(size);
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
    if (lightShown) {
      slots.statusLight = <CenterPattern pattern="mark" mood={mood} paused={still} height={MARK_HEIGHT} />;
      slots.sideWidth = (slots.sideWidth ?? 0) + MARK_LIGHT_EXTRA_WIDTH;
    }
    return Object.keys(slots).length === 0 ? EMPTY : slots;
  }, [center.enabled, usage.enabled, providers, showRemaining, sessionRing.enabled, ringStyle, ringCount, agentsOn, sessions, unseen, onOpenAgents, choice, size, sheet, mood, still, lightShown]);
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
