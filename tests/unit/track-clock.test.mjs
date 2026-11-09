import assert from "node:assert/strict";
import test from "node:test";
import { advanceClock, alignClock, clockPosition, hasTimeline, NO_CLOCK } from "../../src/features/media/trackClock.ts";

test("players that report no position are timed by the island", () => {
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 0 }), false);
  assert.equal(hasTimeline({ positionMs: 0, durationMs: 200_000 }), true);
});

test("the clock counts only playing time and restarts for another track", () => {
  let clock = advanceClock(NO_CLOCK, "余香", true, 1000);
  assert.equal(clockPosition(clock, 4000), 3000);
  clock = advanceClock(clock, "余香", false, 5000);
  assert.equal(clockPosition(clock, 60_000), 4000);
  clock = advanceClock(clock, "余香", true, 70_000);
  assert.equal(clockPosition(clock, 71_000), 5000);
  // Readings that change nothing keep the same clock.
  assert.equal(advanceClock(clock, "余香", true, 72_000), clock);
  clock = advanceClock(clock, "晴天", false, 80_000);
  assert.equal(clockPosition(clock, 90_000), 0);
});

test("only a track the island saw start counts as timed from its start", () => {
  const first = advanceClock(NO_CLOCK, "余香", true, 1000);
  assert.equal(first.fromStart, false);
  assert.equal(advanceClock(first, "晴天", true, 9000).fromStart, true);
});

test("aligning sets the position and makes the clock trusted", () => {
  const playing = alignClock(advanceClock(NO_CLOCK, "余香", true, 1000), 42_000, 5000);
  assert.equal(clockPosition(playing, 6000), 43_000);
  assert.equal(playing.fromStart, true);
  const paused = alignClock(advanceClock(advanceClock(NO_CLOCK, "余香", true, 1000), "余香", false, 2000), 30_000, 9000);
  assert.equal(clockPosition(paused, 20_000), 30_000);
  assert.equal(alignClock(NO_CLOCK, 5000, 1000), NO_CLOCK);
});
