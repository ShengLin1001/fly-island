import assert from "node:assert/strict";
import test from "node:test";
import {
  arrangeCollapsedItems,
  isCollapsedItemHidden,
  moveCollapsedItem,
  setCollapsedItemHidden,
  setCollapsedItemZone,
  zoneIds,
} from "../../src/features/appearance/collapsedItems.ts";

const offered = ["status-light", "mail", "update", "plugin:dev.a/clock", "device-use", "shelf", "music", "usage:claudeCode", "usage:codex", "session-count"];
const ids = (placements) => placements.map(({ id, zone }) => `${zone[0]}:${id}`);

test("with nothing saved, the layout is the bar as it was", () => {
  const placements = arrangeCollapsedItems(offered, []);
  assert.deepEqual(zoneIds(placements, "left", offered), ["status-light"]);
  assert.deepEqual(zoneIds(placements, "right", offered), offered.slice(1));
});

test("a new item goes right after the item that comes before it by default", () => {
  const saved = [{ id: "status-light", zone: "left" }, { id: "music", zone: "left" }, { id: "session-count", zone: "right" }, { id: "mail", zone: "right" }];
  const placements = arrangeCollapsedItems(["status-light", "music", "session-count", "mail", "usage:glm", "update"], saved);
  assert.deepEqual(ids(placements), ["l:status-light", "l:music", "r:session-count", "r:mail", "r:update", "r:usage:glm"]);
  // Nothing before it by default in its zone: first in the zone.
  assert.deepEqual(ids(arrangeCollapsedItems(["session-count", "mail"], [{ id: "session-count", zone: "right" }])), ["r:mail", "r:session-count"]);
});

test("a saved item that is not offered keeps its place and comes back to it", () => {
  const saved = [{ id: "plugin:dev.a/clock", zone: "left" }, { id: "status-light", zone: "left" }];
  const placements = arrangeCollapsedItems(["status-light", "music"], saved);
  assert.deepEqual(zoneIds(placements, "left", ["status-light", "music"]), ["status-light"]);
  assert.deepEqual(zoneIds(placements, "left", ["status-light", "music", "plugin:dev.a/clock"]), ["plugin:dev.a/clock", "status-light"]);
});

test("moving skips items of the other zone and the ones not listed", () => {
  const placements = arrangeCollapsedItems(offered, []);
  const listed = offered.filter((id) => id !== "update");
  const moved = moveCollapsedItem(placements, "plugin:dev.a/clock", -1, listed);
  assert.deepEqual(zoneIds(moved, "right", offered).slice(0, 3), ["plugin:dev.a/clock", "update", "mail"]);
  assert.deepEqual(moveCollapsedItem(placements, "status-light", -1, listed), placements);
  assert.deepEqual(moveCollapsedItem(placements, "session-count", 1, listed), placements);
});

test("changing sides puts the item last on the other side; hiding keeps its place", () => {
  const placements = setCollapsedItemZone(arrangeCollapsedItems(offered, []), "session-count", "left");
  assert.deepEqual(zoneIds(placements, "left", offered), ["status-light", "session-count"]);
  const hidden = setCollapsedItemHidden(placements, "status-light", true);
  assert.ok(isCollapsedItemHidden(hidden, "status-light"));
  assert.deepEqual(zoneIds(hidden, "left", offered), ["session-count"]);
  assert.deepEqual(setCollapsedItemHidden(hidden, "status-light", false), placements);
});
