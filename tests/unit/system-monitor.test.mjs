import assert from "node:assert/strict";
import test from "node:test";
import { HISTORY_LENGTH, formatPercent, formatRate, formatUsedOfTotal, pushSample, sparklinePoints } from "../../src/features/system-monitor/format.ts";
import { pageShortcutOrder, resolveIslandPage } from "../../src/windows/island/features.ts";

test("monitor figures read as percent and speed", () => {
  assert.equal(formatPercent(23.4), "23%");
  assert.equal(formatPercent(140), "100%");
  assert.equal(formatRate(2_150_400), "2.1 MB/s");
  assert.equal(formatUsedOfTotal(12.44 * 1024 ** 3, 15.9 * 1024 ** 3), "12.4 / 15.9 GB");
  assert.equal(formatUsedOfTotal(0, 16 * 1024 ** 3), "0.0 / 16 GB");
});

test("sparklines sit at the right edge and clamp to the top", () => {
  assert.equal(sparklinePoints([], 60, 120, 28, 100), "");
  assert.equal(sparklinePoints([0, 50, 200], 3, 120, 28, 100), "0.0,28.0 60.0,14.0 120.0,0.0");
  assert.equal(sparklinePoints([100], 60, 120, 28, 100), "120.0,0.0");
});

test("the history keeps the newest minute", () => {
  let values = [];
  for (let index = 0; index < HISTORY_LENGTH + 5; index += 1) values = pushSample(values, index);
  assert.equal(values.length, HISTORY_LENGTH);
  assert.equal(values[0], 5);
});

test("the monitor page shows only while its plugin is on", () => {
  const features = { todo: true, music: false, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false, agents: false, translation: false };
  assert.equal(resolveIslandPage("system", features), "todo");
  assert.equal(resolveIslandPage("system", { ...features, system: true }), "system");
  assert.deepEqual(pageShortcutOrder({ ...features, system: true }), ["todo", "system"]);
});
