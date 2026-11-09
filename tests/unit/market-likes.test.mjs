import assert from "node:assert/strict";
import test from "node:test";
import { sortMarketPlugins } from "../../src/features/plugins/marketLikes.ts";

const plugins = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const likes = { b: { count: 2, url: "u" }, c: { count: 7, url: "u" }, d: { count: 2, url: "u" } };

test("the default order is the index order", () => {
  assert.deepEqual(sortMarketPlugins(plugins, "index", likes).map((plugin) => plugin.id), ["a", "b", "c", "d"]);
});

test("most liked first, index order among equals, plugins without likes last", () => {
  assert.deepEqual(sortMarketPlugins(plugins, "likes", likes).map((plugin) => plugin.id), ["c", "b", "d", "a"]);
});

test("sorting leaves the given list alone", () => {
  const given = [...plugins];
  sortMarketPlugins(given, "likes", likes);
  assert.deepEqual(given, plugins);
});
