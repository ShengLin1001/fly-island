import { CenterPattern } from "./CenterPattern";
import type { CenterPatternChoice } from "./centerSettings";
import type { PetMood } from "./patterns";
import { PetSprite } from "./PetSprite";

/**
 * The pet in place of the 16 px agent icon: 18 px tall is about 16.6 px wide (192:208), so the
 * "MM" the collapsed width reserves for the icon still fits it.
 */
export const AGENT_ICON_PET_HEIGHT = 18;

// The mark's box is 36 × 17 units around its 16-unit pill (the rest is room for its spring).
const markHeight = (pill: number) => (pill * 17) / 16;
const markWidth = (pill: number) => Math.ceil((pill * 36) / 16);
/** The mark with its pill as tall as the bar's 24 px rings, as the status light draws it. */
export const MARK_HEIGHT = markHeight(24);
export const MARK_WIDTH = markWidth(24);

/**
 * How tall the center draws at `size` (the plugin's setting, 24 px like the rings by default): a
 * drawing that tall, the mark's pill that tall, and a pet, mostly empty margin in its cell, 4 px taller.
 */
export function centerHeight(pattern: CenterPatternChoice["pattern"], size: number) {
  return pattern === "pet" ? size + 4 : pattern === "mark" ? markHeight(size) : size;
}

/** Px the center needs at `size`: a drawing is at most twice as wide as tall, a pet about as wide. */
export function centerWidth(pattern: CenterPatternChoice["pattern"], size: number) {
  if (pattern === "pet") return Math.ceil(((size + 4) * 192) / 208) + 4;
  return pattern === "mark" ? markWidth(size) + 2 : size * 2;
}

/** The mark before the agent title at `size`: px it needs beyond the 16 px icon it replaces. */
export const agentIconMarkExtraWidth = (size: number) => markWidth(size) - 16;

/**
 * The collapsed island's center: the chosen drawing, or the pet from `sheet` (`usePetSheet`),
 * nothing while it loads and the eyes when it cannot be read; `size` as `centerHeight` takes it.
 */
export function CollapsedCenter({
  choice,
  sheet,
  mood,
  paused,
  size,
}: {
  choice: CenterPatternChoice;
  sheet: string | null | undefined;
  mood: PetMood;
  paused: boolean;
  size: number;
}) {
  if (choice.pattern !== "pet") {
    return <CenterPattern pattern={choice.pattern} paused={paused} height={centerHeight(choice.pattern, size)} mood={mood} />;
  }
  if (sheet === undefined) return null;
  if (sheet === null) return <CenterPattern pattern="eyes" paused={paused} height={size} />;
  return <PetSprite src={sheet} mood={mood} paused={paused} height={centerHeight("pet", size)} />;
}
