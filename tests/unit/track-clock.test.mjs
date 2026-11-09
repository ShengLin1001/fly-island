import assert from "node:assert/strict";
import test from "node:test";
import { advanceClock, alignClock, clockPosition, hasTimeline, NO_CLOCK, startClockAt } from "../../src/features/media/trackClock.ts";

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

test("a track the player says started at a time is timed from then, even after the poll saw it", () => {
  // The poll found the new track at 10.0 s; the player says its sound began at 9.2 s.
  const polled = advanceClock(advanceClock(NO_CLOCK, "余香", true, 0), "晴天", true, 10_000);
  const clock = startClockAt(polled, "晴天", true, 9200, 10_300);
  assert.equal(clockPosition(clock, 11_200), 2000);
  assert.equal(clock.fromStart, true);
  // A track the island had not seen yet starts there too, and counts as timed from its start.
  assert.equal(clockPosition(startClockAt(NO_CLOCK, "晴天", true, 9200, 9500), 10_200), 1000);
  assert.equal(startClockAt(NO_CLOCK, "晴天", true, 9200, 9500).fromStart, true);
});

test("a start the clock is already well past leaves it alone", () => {
  const playing = advanceClock(advanceClock(NO_CLOCK, "余香", true, 0), "晴天", true, 1000);
  assert.equal(startClockAt(playing, "晴天", true, 60_000, 60_100), playing);
});

test("a start announced while paused waits for play", () => {
  const clock = startClockAt(NO_CLOCK, "晴天", false, 5000, 5100);
  assert.equal(clockPosition(clock, 9000), 0);
  assert.equal(clockPosition(advanceClock(clock, "晴天", true, 9000), 10_000), 1000);
});
