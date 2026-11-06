import assert from "node:assert/strict";
import test from "node:test";
import { en, zhCN } from "../../src/i18n/sections/claudeSessions.ts";
import { sameClaudeSessions, sessionRingCardLines, sessionRingSegments, sessionRingSummary } from "../../src/features/claude-sessions/sessionRing.ts";

const counts = (overrides = {}) => ({ needs: 0, yourturn: 0, working: 0, stale: 0, done: 0, total: 0, ...overrides });
const snapshot = (overrides = {}) => ({ detected: true, stateDir: "C:\state", sessions: [], counts: counts(), ...overrides });

test("segments follow priority order, skip empty states and use the claude-sessions palette", () => {
  assert.deepEqual(sessionRingSegments(counts({ needs: 1, yourturn: 2, working: 3, done: 1, total: 7 })), [
    { value: 1, color: "#FF453A" },
    { value: 2, color: "#FFD60A" },
    { value: 3, color: "#34C759" },
    { value: 1, color: "#8E8E93" },
  ]);
  assert.deepEqual(sessionRingSegments(counts({ working: 1, stale: 2, total: 3 })), [
    { value: 1, color: "#34C759" },
    { value: 2, color: "rgba(52, 199, 89, 0.45)" },
  ]);
  assert.deepEqual(sessionRingSegments(counts()), []);
});

test("the tooltip lists states that have sessions, in both languages", () => {
  const busy = snapshot({ counts: counts({ needs: 1, yourturn: 2, working: 3, done: 1, total: 7 }) });
  assert.equal(sessionRingSummary(busy, zhCN), "等授权 1 · 等你回复 2 · 运行 3 · 完成 1");
  assert.equal(sessionRingSummary(busy, en), "Needs approval 1 · Your turn 2 · Running 3 · Done 1");
  assert.equal(sessionRingSummary(snapshot({ counts: counts({ stale: 1, total: 1 }) }), zhCN), "可能已停 1");
  assert.equal(sessionRingSummary(snapshot(), zhCN), zhCN.empty);
  assert.equal(sessionRingSummary(snapshot({ detected: false }), zhCN), "未检测到 claude-sessions");
  assert.equal(sessionRingSummary(null, en), en.notDetected);
});

test("an identical snapshot counts as unchanged", () => {
  assert.equal(sameClaudeSessions(null, snapshot()), false);
  assert.equal(sameClaudeSessions(snapshot(), snapshot()), true);
  assert.equal(sameClaudeSessions(snapshot(), snapshot({ counts: counts({ done: 1, total: 1 }) })), false);
});

test("the hover card names up to three sessions waiting on you, approvals first", () => {
  const session = (sessionId, state, title, cwd = "F:\\code\\fly-island\\") => ({ sessionId, state, stale: false, title, cwd, updatedAt: 0 });
  const busy = snapshot({
    counts: counts({ needs: 2, yourturn: 2, working: 1, total: 5 }),
    sessions: [
      session("a", "needs", "改设置页"),
      session("b", "needs", "", "/home/me/hpc"),
      session("c", "yourturn", "选数据库"),
      session("d", "yourturn", "第四条"),
      session("e", "working", "跑测试"),
    ],
  });
  assert.deepEqual(sessionRingCardLines(busy, zhCN), [
    "等授权 2 · 等你回复 2 · 运行 1",
    "等授权：改设置页 · fly-island",
    "等授权：hpc",
    "等你回复：选数据库 · fly-island",
  ]);
  assert.equal(sessionRingCardLines(busy, en)[1], "Needs approval: 改设置页 · fly-island");
  assert.deepEqual(sessionRingCardLines(snapshot({ detected: false }), zhCN), ["未检测到 claude-sessions"]);
  const named = snapshot({
    counts: counts({ yourturn: 2, total: 2 }),
    sessions: [session("0123456789abcdef", "yourturn", "", ""), session("f", "yourturn", "长".repeat(41), "")],
  });
  assert.deepEqual(sessionRingCardLines(named, zhCN).slice(1), ["等你回复：01234567", `等你回复：${"长".repeat(40)}…`]);
});
