import { useMemo } from "react";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { MiniRing } from "../../components/MiniRing";
import { useTranslation } from "../../i18n";
import { USAGE_PROVIDERS, usageCardLines, usageRings, type UsageProvider } from "./usageRing";
import { useClaudeUsage } from "./useClaudeUsage";
import "./ClaudeUsageGauge.css";

type ClaudeUsageGaugeProps = {
  /** Whose usage, in its colour (Claude Code when left out). */
  provider?: UsageProvider;
  /** False once the cursor has left the island, which closes the card. */
  islandHovered?: boolean;
  /** Shows what is left instead of what is used (the plugin's "show" setting). */
  showRemaining?: boolean;
};

/**
 * One agent's usage ring on the collapsed bar: 5 hours outside, 7 days (or the month) inside.
 * Resting on it shows the details under the island, headed by the agent's name and plan; a
 * click asks again.
 */
export function ClaudeUsageGauge({ provider = USAGE_PROVIDERS[0], islandHovered = true, showRemaining = false }: ClaudeUsageGaugeProps) {
  const t = useTranslation();
  const { usage, now, refresh } = useClaudeUsage(provider.id);
  const rings = useMemo(() => usageRings(usage, now, showRemaining, provider.color), [usage, now, showRemaining, provider]);
  const lines = useMemo(() => usageCardLines(usage, now, t.claudeUsage, showRemaining, provider), [usage, now, t, showRemaining, provider]);
  const label = t.claudeUsage.ringLabel(lines.map((line) => line.text).join("; "));

  return (
    <IslandHoverCard lines={lines} suppressed={!islandHovered}>
      <button
        className="claude-usage-gauge"
        type="button"
        data-provider={provider.id}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          refresh();
        }}
      >
        <MiniRing rings={rings} ariaLabel={label} />
      </button>
    </IslandHoverCard>
  );
}
