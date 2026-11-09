import assert from "node:assert/strict";
import test from "node:test";
import { songLine } from "../../src/features/media/lyrics/songLine.ts";

const playing = { title: "麻雀", artist: "李荣浩", playbackStatus: "playing" };

test("a playing song without lyrics names itself in the lyric's place", () => {
  assert.deepEqual(songLine(playing, true), { text: "麻雀 - 李荣浩", index: -2, longest: "麻雀 - 李荣浩", song: true });
  assert.equal(songLine({ ...playing, artist: " " }, true)?.text, "麻雀");
});

test("no song line while lyrics were found or are being looked up, while paused, or without a title", () => {
  assert.equal(songLine(playing, false), null);
  assert.equal(songLine({ ...playing, playbackStatus: "paused" }, true), null);
  assert.equal(songLine({ ...playing, title: null }, true), null);
});
