import assert from "node:assert/strict";
import test from "node:test";
import { USAGE_COLORS, USAGE_STALE_MS, isUsageStale, newerUsage, usageCardLines, usageColor, usageRings } from "../../src/features/claude-usage/usageRing.ts";
import { en, zhCN } from "../../src/i18n/sections/claudeUsage.ts";

const NOW = Date.parse("2026-11-06T08:00:00Z");
const MINUTE = 60_000;

function usage(overrides = {}) {
  return {
    fiveHour: { percent: 42.4, resetsAt: new Date(NOW + (2 * 60 + 13) * MINUTE + 30_000).toISOString() },
    sevenDay: { percent: 17, resetsAt: new Date(NOW + (3 * 1440 + 4 * 60) * MINUTE).toISOString() },
    source: "api",
    updatedAt: NOW - MINUTE,
    error: null,
    revision: 3,
    ...overrides,
  };
}
const EMPTY = { fiveHour: null, sevenDay: null, source: null, updatedAt: null, error: null, revision: 0 };
const texts = (lines) => lines.map((line) => line.text);

test("ring colour follows the thresholds and turns grey when stale", () => {
  assert.equal(usageColor(0, false), USAGE_COLORS.normal);
  assert.equal(usageColor(69.9, false), USAGE_COLORS.normal);
  assert.equal(usageColor(70, false), USAGE_COLORS.warn);
  assert.equal(usageColor(90, false), USAGE_COLORS.danger);
  assert.equal(usageColor(100, true), USAGE_COLORS.stale);
});

test("only the age of the numbers makes them stale, not a failed refresh", () => {
  assert.equal(isUsageStale(usage(), NOW), false);
  assert.equal(isUsageStale(usage({ error: { kind: "network", message: "x" } }), NOW), false);
  assert.equal(isUsageStale(usage({ updatedAt: NOW - USAGE_STALE_MS - 1 }), NOW), true);
  assert.equal(isUsageStale(usage({ updatedAt: null }), NOW), true);
});

test("rings: 5 hours outside, 7 days inside, bare grey tracks before any numbers", () => {
  assert.deepEqual(usageRings(usage(), NOW), [
    { value: 0.424, color: USAGE_COLORS.normal },
    { value: 0.17, color: USAGE_COLORS.normal },
  ]);
  assert.deepEqual(usageRings(usage({ fiveHour: { percent: 95, resetsAt: null }, updatedAt: NOW - 20 * MINUTE }), NOW)[0], { value: 0.95, color: USAGE_COLORS.stale });
  assert.deepEqual(usageRings(EMPTY, NOW), [{ value: 0, color: USAGE_COLORS.stale }, { value: 0, color: USAGE_COLORS.stale }]);
});

test("card lists both windows with countdowns, then when and from where", () => {
  const lines = usageCardLines(usage(), NOW, zhCN);
  assert.deepEqual(texts(lines), ["5 小时 42% · 2 小时 13 分后重置", "7 天 17% · 3 天 4 小时后重置", "1 分钟前更新 · 来自 Anthropic"]);
  assert.equal(lines[0].color, USAGE_COLORS.normal);
  assert.equal(lines[2].muted, true);
  assert.deepEqual(texts(usageCardLines(usage(), NOW, en)), ["5h 42% · resets in 2h 13m", "7d 17% · resets in 3d 4h", "updated 1 min ago · from Anthropic"]);
});

test("card handles missing reset times, past resets and short countdowns", () => {
  const lines = usageCardLines(usage({
    fiveHour: { percent: 99.6, resetsAt: new Date(NOW + 5 * MINUTE).toISOString() },
    sevenDay: { percent: 3, resetsAt: null },
  }), NOW, zhCN);
  assert.deepEqual(texts(lines).slice(0, 2), ["5 小时 100% · 5 分后重置", "7 天 3%"]);
  assert.equal(lines[0].color, USAGE_COLORS.danger);
  const past = usageCardLines(usage({ fiveHour: { percent: 1, resetsAt: new Date(NOW - MINUTE).toISOString() }, sevenDay: null }), NOW, en);
  assert.equal(past[0].text, "5h 1% · resetting soon");
});

test("card names the failure, the age and the hud source", () => {
  const failed = usage({ updatedAt: NOW - 23 * MINUTE, error: { kind: "tokenExpired", message: "" } });
  assert.deepEqual(texts(usageCardLines(failed, NOW, zhCN)).slice(2), ["登录已过期，打开 Claude Code 以刷新登录", "23 分钟前更新 · 来自 Anthropic"]);
  const hud = usage({ source: "hud", updatedAt: NOW - 3 * 60 * MINUTE });
  assert.deepEqual(texts(usageCardLines(hud, NOW, en)).slice(2), ["updated 3 h ago · via claude-hud"]);
  const empty = { ...EMPTY, error: { kind: "noCredentials", message: "" } };
  assert.deepEqual(texts(usageCardLines(empty, NOW, en)), [en.noData, en.errors.noCredentials]);
});

test("an older snapshot never replaces a newer one", () => {
  const current = usage();
  const older = usage({ revision: 2, updatedAt: NOW });
  const failed = usage({ revision: 4, error: { kind: "network", message: "" } });
  assert.equal(newerUsage(current, older), current);
  assert.equal(newerUsage(current, EMPTY), current);
  assert.equal(newerUsage(current, failed), failed);
  assert.equal(newerUsage(EMPTY, older), older);
});
