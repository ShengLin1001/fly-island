import assert from "node:assert/strict";
import test from "node:test";
import { USAGE_COLORS, USAGE_PROVIDERS, USAGE_STALE_MS, isUsageStale, shownUsageProviders, usageCardLines, usageColor, usageRings } from "../../src/features/claude-usage/usageRing.ts";
import { en, zhCN } from "../../src/i18n/sections/claudeUsage.ts";

const NOW = Date.parse("2026-11-06T08:00:00Z");
const MINUTE = 60_000;

// Shaped like AgentUsage from get_agent_usage (claude-hud's snapshot).
function usage(overrides = {}) {
  return {
    updatedAt: NOW - MINUTE,
    fiveHour: { name: "", used: 42.4, resetsAt: NOW + (2 * 60 + 13) * MINUTE },
    sevenDay: { name: "", used: 17, resetsAt: NOW + (3 * 1440 + 4 * 60) * MINUTE },
    models: [],
    plan: "Max 20x",
    ...overrides,
  };
}
const texts = (lines) => lines.map((line) => line.text);

test("ring colour follows the thresholds and turns grey when stale", () => {
  assert.equal(usageColor(0, false), USAGE_COLORS.normal);
  assert.equal(usageColor(69.9, false), USAGE_COLORS.normal);
  assert.equal(usageColor(70, false), USAGE_COLORS.warn);
  assert.equal(usageColor(90, false), USAGE_COLORS.danger);
  assert.equal(usageColor(100, true), USAGE_COLORS.stale);
});

test("no snapshot or an old one is stale; one without a write time is not", () => {
  assert.equal(isUsageStale(usage(), NOW), false);
  assert.equal(isUsageStale(usage({ updatedAt: NOW - USAGE_STALE_MS - 1 }), NOW), true);
  assert.equal(isUsageStale(usage({ updatedAt: null }), NOW), false);
  assert.equal(isUsageStale(null, NOW), true);
});

test("rings: 5 hours outside, 7 days inside, bare grey tracks without a snapshot", () => {
  assert.deepEqual(usageRings(usage(), NOW), [
    { value: 0.424, color: USAGE_COLORS.normal },
    { value: 0.17, color: USAGE_COLORS.normal },
  ]);
  assert.deepEqual(usageRings(usage({ fiveHour: { name: "", used: 95, resetsAt: null }, updatedAt: NOW - 20 * MINUTE }), NOW)[0], { value: 0.95, color: USAGE_COLORS.stale });
  assert.deepEqual(usageRings(null, NOW), [{ value: 0, color: USAGE_COLORS.stale }, { value: 0, color: USAGE_COLORS.stale }]);
  assert.deepEqual(usageRings(usage({ sevenDay: null }), NOW)[1], { value: 0, color: USAGE_COLORS.stale });
});

test("card lists both windows with countdowns, then the snapshot's age", () => {
  const lines = usageCardLines(usage(), NOW, zhCN);
  assert.deepEqual(texts(lines), ["5 小时 42% · 2 小时 13 分后重置", "7 天 17% · 3 天 4 小时后重置", "1 分钟前更新 · 来自 claude-hud"]);
  assert.equal(lines[0].color, USAGE_COLORS.normal);
  assert.equal(lines[2].muted, true);
  assert.deepEqual(texts(usageCardLines(usage(), NOW, en)), ["5h 42% · resets in 2h 13m", "7d 17% · resets in 3d 4h", "updated 1 min ago · via claude-hud"]);
});

test("remaining fills the rings with what is left and says so, colour still by what is used", () => {
  const u = usage({ fiveHour: { name: "", used: 92, resetsAt: NOW + (2 * 60 + 13) * MINUTE } });
  const [outer, inner] = usageRings(u, NOW, true);
  assert.ok(Math.abs(outer.value - 0.08) < 1e-9);
  assert.equal(outer.color, USAGE_COLORS.danger);
  assert.equal(inner.value, 0.83);
  assert.deepEqual(texts(usageCardLines(u, NOW, zhCN, true)).slice(0, 2), ["5 小时 剩余 8% · 2 小时 13 分后重置", "7 天 剩余 83% · 3 天 4 小时后重置"]);
  assert.deepEqual(texts(usageCardLines(u, NOW, en, true)).slice(0, 1), ["5h 8% left · resets in 2h 13m"]);
  assert.deepEqual(usageRings(usage({ fiveHour: { name: "", used: 104, resetsAt: null } }), NOW, true)[0].value, 0);
});

test("card handles missing reset times, past resets and missing snapshots", () => {
  const lines = usageCardLines(usage({
    fiveHour: { name: "", used: 99.6, resetsAt: NOW + 5 * MINUTE },
    sevenDay: { name: "", used: 3, resetsAt: null },
  }), NOW, zhCN);
  assert.deepEqual(texts(lines).slice(0, 2), ["5 小时 100% · 5 分后重置", "7 天 3%"]);
  assert.equal(lines[0].color, USAGE_COLORS.danger);
  const past = usageCardLines(usage({ fiveHour: { name: "", used: 1, resetsAt: NOW - MINUTE }, sevenDay: null }), NOW, en);
  assert.equal(past[0].text, "5h 1% · resetting soon");
  assert.deepEqual(texts(usageCardLines(usage({ updatedAt: NOW - 3 * 60 * MINUTE }), NOW, en)).slice(2), ["updated 3 h ago · via claude-hud"]);
  assert.deepEqual(texts(usageCardLines(null, NOW, en)), [en.noData]);
  assert.deepEqual(texts(usageCardLines(usage({ fiveHour: null, sevenDay: null, updatedAt: null }), NOW, en)), [en.noData]);
});

test("asking Anthropic directly: its numbers name the source, its failures add a line", () => {
  assert.deepEqual(texts(usageCardLines(usage({ source: "api" }), NOW, zhCN)).slice(2), ["1 分钟前更新 · 来自 Anthropic"]);
  assert.deepEqual(texts(usageCardLines(usage({ source: "magpie" }), NOW, en)).slice(2), ["updated 1 min ago · from magpie"]);
  // A failure keeps the fresh numbers coloured and says why.
  const failed = usageCardLines(usage({ source: "hud", error: { kind: "loginRequired", message: "" } }), NOW, zhCN);
  assert.deepEqual(texts(failed).slice(2), ["需要在 Claude Code 里重新登录", "1 分钟前更新 · 来自 claude-hud"]);
  assert.equal(failed[0].color, USAGE_COLORS.normal);
  // No numbers at all: the reason, without an age.
  const empty = usage({ fiveHour: null, sevenDay: null, updatedAt: null, error: { kind: "noProxy", message: "" } });
  assert.deepEqual(texts(usageCardLines(empty, NOW, en)), [en.noData, en.errors.noProxy]);
  // Every error kind has text in both languages.
  for (const kind of ["noCredentials", "tokenExpired", "loginRequired", "forbidden", "rateLimited", "noProxy", "network", "http", "invalidResponse"]) {
    assert.ok(zhCN.errors[kind] && en.errors[kind], kind);
  }
});

const provider = (id) => USAGE_PROVIDERS.find((known) => known.id === id);

test("providers: Claude Code on by default, the rest by their switches, each its own colour", () => {
  assert.deepEqual(shownUsageProviders({}).map(({ id }) => id), ["claudeCode"]);
  assert.deepEqual(shownUsageProviders({ claudeCode: false, kimi: true, codex: true }).map(({ id }) => id), ["codex", "kimi"]);
  assert.equal(new Set(USAGE_PROVIDERS.map(({ color }) => color)).size, USAGE_PROVIDERS.length);
  assert.ok(USAGE_PROVIDERS.every(({ color }) => ![USAGE_COLORS.warn, USAGE_COLORS.danger, USAGE_COLORS.stale].includes(color)));
  const glm = provider("glm");
  assert.deepEqual(usageRings(usage(), NOW, false, glm.color).map(({ color }) => color), [glm.color, glm.color]);
  assert.equal(usageRings(usage({ fiveHour: { name: "", used: 91, resetsAt: null } }), NOW, false, glm.color)[0].color, USAGE_COLORS.danger);
});

test("a plan without a weekly limit fills the inner ring with its month", () => {
  const kimi = usage({ sevenDay: null, models: [{ name: "month", used: 30, resetsAt: null }], source: "kimi", plan: null });
  assert.equal(usageRings(kimi, NOW)[1].value, 0.3);
  assert.deepEqual(texts(usageCardLines(kimi, NOW, zhCN, false, provider("kimi"))), ["Kimi", "5 小时 42% · 2 小时 13 分后重置", "本月 30%", "1 分钟前更新 · 来自 Kimi"]);
});

test("with a provider the card starts with its name and plan in its colour", () => {
  const claude = provider("claudeCode");
  const lines = usageCardLines(usage(), NOW, zhCN, false, claude);
  assert.deepEqual(lines[0], { text: "Claude Code · Max 20x", color: claude.color });
  const glm = usage({ source: "glm", plan: "GLM Coding Pro", models: [{ name: "mcpMonth", used: 5, resetsAt: null }] });
  assert.deepEqual(texts(usageCardLines(glm, NOW, en, false, provider("glm"))), [
    "GLM · GLM Coding Pro", "5h 42% · resets in 2h 13m", "7d 17% · resets in 3d 4h", "MCP month 5%", "updated 1 min ago · from Zhipu's open platform",
  ]);
  assert.deepEqual(texts(usageCardLines(null, NOW, zhCN, false, provider("codex"))), ["Codex", zhCN.noUsage.codex]);
  // GLM or Kimi without a key: the provider's hint and the key's reason, not Claude's login.
  const noKey = usage({ source: "glm", fiveHour: null, sevenDay: null, updatedAt: null, plan: null, error: { kind: "noCredentials", message: "" } });
  assert.deepEqual(texts(usageCardLines(noKey, NOW, zhCN, false, provider("glm"))), ["GLM", zhCN.noUsage.glm, "还没有保存 API Key，请在插件页填写"]);
  for (const kind of Object.keys(zhCN.errors)) assert.ok(zhCN.planErrors[kind] && en.planErrors[kind], kind);
});
