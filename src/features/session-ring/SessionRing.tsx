import { useMemo, type CSSProperties } from "react";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { MiniRing } from "../../components/MiniRing";
import { useTranslation } from "../../i18n";
import type { AgentSessionSummary } from "../agent-status/api";
import {
  SESSION_RING_STATES,
  sessionGridCells,
  sessionRingCardLines,
  sessionRingSegments,
  sessionRingSummary,
  sessionSignal,
  type SessionRingCounts,
} from "./ringCounts.ts";
import "./SessionRing.css";

/** Outer size of the ring in px; it takes the blue session count's place. */
export const SESSION_RING_SIZE = 24;

/** The plugin's "style" setting. */
export const SESSION_RING_STYLES = ["grid", "ring", "bar", "signal"] as const;
export type SessionRingStyle = (typeof SESSION_RING_STYLES)[number];

const STATE_COLORS: Record<string, string> = Object.fromEntries(SESSION_RING_STATES.map(({ key, color }) => [key, color]));
const colorOf = (state: string | undefined) => (state && STATE_COLORS[state] ? ({ "--cell-color": STATE_COLORS[state] } as CSSProperties) : undefined);

type SessionRingProps = {
  /** The sessions the Agent page lists. */
  sessions: readonly AgentSessionSummary[];
  unseen: ReadonlySet<string>;
  counts: SessionRingCounts;
  style: SessionRingStyle;
  /** Stops the pulsing while the bar is not on screen. */
  paused: boolean;
  /** Opens the Agent page. */
  onOpen: () => void;
};

/**
 * One cell per session, coloured by its state, on a 2 × 2 board (up to four sessions) or a
 * 3 × 3 one; unused cells stay as faint dots so the board keeps its shape.
 */
function SessionGrid({ counts }: { counts: SessionRingCounts }) {
  const cells = sessionGridCells(counts);
  const side = cells.length <= 4 ? 2 : 3;
  return (
    <span className={`session-grid session-grid--${side}`} aria-hidden="true">
      {Array.from({ length: side * side }, (_, index) => (
        <span key={index} className="session-grid__cell" data-state={cells[index]} style={colorOf(cells[index])} />
      ))}
    </span>
  );
}

/** The count, then one capsule split by state, each part as long as its share of sessions. */
function SessionBar({ counts }: { counts: SessionRingCounts }) {
  return (
    <span className="session-bar" aria-hidden="true">
      <span className="session-bar__count">{counts.total}</span>
      <span className="session-bar__track">
        {SESSION_RING_STATES.filter(({ key }) => counts[key] > 0).map(({ key }) => (
          <span key={key} className="session-bar__part" data-state={key} style={{ ...colorOf(key), flexGrow: counts[key] }} />
        ))}
      </span>
    </span>
  );
}

/**
 * Signal bars: a column per colour that has sessions, least urgent on the left, a bar lit per
 * session from the bottom, the rest dim, like a level meter.
 */
function SessionSignal({ counts }: { counts: SessionRingCounts }) {
  const { columns, slots, bar } = sessionSignal(counts);
  return (
    <span className="session-signal" style={{ "--signal-bar": bar } as CSSProperties} aria-hidden="true">
      {columns.map(({ key, bars }) => (
        <span key={key} className="session-signal__column" data-column={key}>
          {Array.from({ length: slots }, (_, index) => (
            <span key={index} className="session-signal__bar" data-state={bars[index]} style={colorOf(bars[index])} />
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * The Agent page's sessions on the collapsed bar: a pixel grid, a segmented ring with the count
 * in the middle, a count with a state bar, or signal bars.
 */
export function SessionRing({ sessions, unseen, counts, style, paused, onOpen }: SessionRingProps) {
  const t = useTranslation();
  const summary = sessionRingSummary(counts, t.sessionRing);
  const lines = useMemo(
    () => sessionRingCardLines(sessions, unseen, t.sessionRing).map((text) => ({ text })),
    [sessions, unseen, t.sessionRing],
  );
  return (
    <IslandHoverCard lines={lines}>
      <button
        className={`session-ring session-ring--button${paused ? " session-ring--paused" : ""}`}
        type="button"
        aria-label={t.sessionRing.openAgents(summary)}
        onClick={(event) => {
          // The bar itself opens the island on a click; this one goes to the Agent page.
          event.stopPropagation();
          onOpen();
        }}
      >
        {style === "ring" ? (
          <MiniRing
            className={counts.total >= 10 ? "session-ring__ring--long" : undefined}
            segments={sessionRingSegments(counts)}
            size={SESSION_RING_SIZE}
            label={String(counts.total)}
            ariaLabel={summary}
          />
        ) : style === "bar" ? (
          <SessionBar counts={counts} />
        ) : style === "signal" ? (
          <SessionSignal counts={counts} />
        ) : (
          <SessionGrid counts={counts} />
        )}
      </button>
    </IslandHoverCard>
  );
}
