import assert from "node:assert/strict";
import test from "node:test";
import { USAGE_COLORS, USAGE_STALE_MS, isUsageStale, newerUsage, usageColor, usageTooltipLines } from "../../src/features/claude-usage/usageRing.ts";
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
    ...overrides,
  };
}

test("ring colour follows the thresholds and turns grey when stale", () => {
  assert.equal(usageColor(0, false), USAGE_COLORS.normal);
  assert.equal(usageColor(69.9, false), USAGE_COLORS.normal);
  assert.equal(usageColor(70, false), USAGE_COLORS.warn);
  assert.equal(usageColor(90, false), USAGE_COLORS.danger);
  assert.equal(usageColor(100, true), USAGE_COLORS.stale);
});

test("numbers are stale when missing, failed or older than 15 minutes", () => {
  assert.equal(isUsageStale(usage(), NOW), false);
  assert.equal(isUsageStale(usage({ updatedAt: NOW - USAGE_STALE_MS - 1 }), NOW), true);
  assert.equal(isUsageStale(usage({ updatedAt: null }), NOW), true);
  assert.equal(isUsageStale(usage({ error: { kind: "network", message: "x" } }), NOW), true);
});

test("tooltip lists both windows with reset countdowns", () => {
  assert.deepEqual(usageTooltipLines(usage(), NOW, zhCN), ["5 小时 42% · 2 小时 13 分后重置", "7 天 17% · 3 天 4 小时后重置"]);
  assert.deepEqual(usageTooltipLines(usage(), NOW, en), ["5h 42% · resets in 2h 13m", "7d 17% · resets in 3d 4h"]);
});

test("tooltip handles missing reset times, past resets and short countdowns", () => {
  const lines = usageTooltipLines(
    usage({
      fiveHour: { percent: 99.6, resetsAt: new Date(NOW + 5 * MINUTE).toISOString() },
      sevenDay: { percent: 3, resetsAt: null },
    }),
    NOW,
    zhCN,
  );
  assert.deepEqual(lines, ["5 小时 100% · 5 分后重置", "7 天 3%"]);
  const past = usageTooltipLines(usage({ fiveHour: { percent: 1, resetsAt: new Date(NOW - MINUTE).toISOString() }, sevenDay: null }), NOW, en);
  assert.deepEqual(past, ["5h 1% · resetting soon"]);
});

test("tooltip explains failures, age and the hud source", () => {
  const failed = usage({ updatedAt: NOW - 23 * MINUTE, error: { kind: "loginRequired", message: "HTTP 401" } });
  assert.deepEqual(usageTooltipLines(failed, NOW, zhCN).slice(2), ["需要在 Claude Code 里重新登录", "23 分钟前更新"]);
  const hud = usage({ source: "hud", updatedAt: NOW - 3 * 60 * MINUTE });
  assert.deepEqual(usageTooltipLines(hud, NOW, en).slice(2), ["updated 3 h ago", "via claude-hud"]);
  const empty = { fiveHour: null, sevenDay: null, source: null, updatedAt: null, error: { kind: "noCredentials", message: "" } };
  assert.deepEqual(usageTooltipLines(empty, NOW, en), [en.noData, en.errors.noCredentials]);
});

test("an older snapshot never replaces a newer one", () => {
  const current = usage();
  const older = usage({ updatedAt: NOW - 10 * MINUTE });
  const failed = usage({ error: { kind: "tokenExpired", message: "" } });
  const empty = { fiveHour: null, sevenDay: null, source: null, updatedAt: null, error: null };
  assert.equal(newerUsage(current, older), current);
  assert.equal(newerUsage(current, empty), current);
  assert.equal(newerUsage(current, failed), failed);
  assert.equal(newerUsage(empty, older), older);
  assert.deepEqual(usageTooltipLines(failed, NOW, zhCN).slice(2), ["登录已过期，打开 Claude Code 以刷新登录", "1 分钟前更新"]);
});
