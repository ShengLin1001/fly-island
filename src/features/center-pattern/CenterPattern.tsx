import { useId, type CSSProperties } from "react";
import type { CenterPatternId, PetMood } from "./patterns";
import { PatternEyes } from "./PatternEyes";
import "./CenterPattern.css";

type CenterPatternProps = {
  pattern: CenterPatternId;
  /** Freeze every loop: the island is expanded or tucked away. Reduced motion freezes on its own. */
  paused?: boolean;
  /** CSS pixels; the width follows each pattern's own proportions (at most about 44 px at 22). */
  height?: number;
  /** What the agents are doing, as the pet would act it out; only the mark shows it. */
  mood?: PetMood;
};

/** One of the built-in animated drawings shown in the collapsed island when there is no summary text. */
export function CenterPattern({ pattern, paused = false, height = 22, mood = "idle" }: CenterPatternProps) {
  return (
    <span
      className="center-pattern"
      data-pattern={pattern}
      data-paused={paused || undefined}
      style={{ "--center-pattern-height": `${height}px` } as CSSProperties}
      aria-hidden="true"
    >
      {pattern === "eyes" && <PatternEyes paused={paused} />}
      {pattern === "bird" && <Bird />}
      {pattern === "orb" && <Orb />}
      {pattern === "cat" && <Cat />}
      {pattern === "mark" && <Mark mood={mood} />}
    </span>
  );
}

/**
 * The app's mark (src-tauri/icons/mark.svg): a pill with a light and a dash. Idle, the light
 * breathes and the pill now and then springs open like the island; otherwise the light takes
 * the session light's colour and the dash shows the agents: dots while running, a tick when done.
 */
function Mark({ mood }: { mood: PetMood }) {
  return (
    <svg className="center-mark" viewBox="0 2.5 36 17" data-mood={mood}>
      <rect className="center-mark-pill" x={2.75} y={3} width={30.5} height={16} rx={8} />
      <g className="center-mark-light">
        <circle cx={10.75} cy={11} r={2.9} />
      </g>
      <g className="center-mark-dash">
        {mood === "running" ? (
          <g className="center-mark-typing">
            <circle cx={19.4} cy={11} r={1.45} />
            <circle cx={22.4} cy={11} r={1.45} />
            <circle cx={25.4} cy={11} r={1.45} />
          </g>
        ) : mood === "done" ? (
          <path className="center-mark-check" d="m18.75 11.4 2.4 2.4 4.55-4.8" />
        ) : (
          <path d="M18.75 11H26" />
        )}
      </g>
    </svg>
  );
}

/** Sits, tilts its head, pecks twice and flaps, on one eight-second loop. */
function Bird() {
  return (
    <svg className="center-bird" viewBox="0 0 34 22">
      <g className="center-bird-legs">
        <path d="M14.4 18.6 13.8 21.2M17.4 18.6l.4 2.6" />
      </g>
      <g className="center-bird-body">
        <path className="center-bird-plumage" d="M8.6 12.2 2.4 9.6l1.6 4.2 4.6.8Z" />
        <ellipse className="center-bird-plumage" cx={15.4} cy={13.6} rx={8} ry={5.4} />
        <path className="center-bird-wing" d="M9.6 12.6c3-3.4 7.8-3.6 10.8-.8-3 3.8-7.4 4.4-10.8.8Z" />
        <g className="center-bird-head">
          <circle className="center-bird-plumage" cx={22.6} cy={8.6} r={4.6} />
          <path className="center-bird-beak" d="m26.8 7.5 4.2 1.4-4.2 1.4Z" />
          <circle className="center-bird-eye" cx={24} cy={7.8} r={1.05} />
        </g>
      </g>
    </svg>
  );
}

/** A soft light that breathes in and out. */
function Orb() {
  const glow = `center-orb-glow-${useId().replace(/:/g, "")}`;
  return (
    <svg className="center-orb" viewBox="0 0 22 22">
      <defs>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="center-orb-halo" cx={11} cy={11} r={10} fill={`url(#${glow})`} />
      <circle className="center-orb-core" cx={11} cy={11} r={3.4} />
    </svg>
  );
}

/** A cat face that slow-blinks and flicks an ear. */
function Cat() {
  return (
    <svg className="center-cat" viewBox="0 0 30 22">
      <g className="center-cat-head">
        <path className="center-cat-fur" d="m5.6 10 .9-7.8 6 4.4Z" />
        <path className="center-cat-inner" d="m7.4 7.6.4-3.6 2.8 2.2Z" />
        <g className="center-cat-ear">
          <path className="center-cat-fur" d="m24.4 10-.9-7.8-6 4.4Z" />
          <path className="center-cat-inner" d="m22.6 7.6-.4-3.6-2.8 2.2Z" />
        </g>
        <ellipse className="center-cat-fur" cx={15} cy={13.4} rx={10} ry={7.4} />
        <ellipse className="center-cat-eye" cx={10.8} cy={12.6} rx={1.45} ry={2} />
        <ellipse className="center-cat-eye" cx={19.2} cy={12.6} rx={1.45} ry={2} />
        <path className="center-cat-nose" d="M14 15.4h2l-1 1.1Z" />
        <path className="center-cat-mouth" d="M15 16.5q-.9 1.3-2.1.7M15 16.5q.9 1.3 2.1.7" />
      </g>
    </svg>
  );
}
