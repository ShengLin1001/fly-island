import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_GRID_MAX,
  SESSION_RING_STATES,
  SESSION_SIGNAL_MAX,
  sessionGridCells,
  sessionRingCardLines,
  sessionRingCounts,
  sessionRingSegments,
  sessionRingState,
  sessionRingSummary,
  sessionSignal,
} from "../../src/features/session-ring/ringCounts.ts";
import { en, zhCN } from "../../src/i18n/sections/sessionRing.ts";

const NOW = Date.parse("2026-11-06T08:00:00Z");
const MINUTE = 60_000;

function session(sessionId, phase, overrides = {}) {
  return {
    provider: "claudeCode",
    sessionId,
    cwd: "F:\\code\\fly-island",
    title: `title ${sessionId}`,
    model: null,
    effort: null,
    phase,
    lastMessage: null,
    updatedAt: NOW - MINUTE,
    host: null,
    turnStartedAt: null,
    ...overrides,
  };
}
const NONE = new Set();
const color = (key) => SESSION_RING_STATES.find((state) => state.key === key).color;

test("phases map to ring states the way the Agent page lights its rows", () => {
  const unseen = new Set(["claudeCode:a"]);
  const old = { updatedAt: NOW - 600 * MINUTE };
  assert.equal(sessionRingState(session("a", "waiting"), unseen), "needs");
  assert.equal(sessionRingState(session("a", "running"), NONE), "working");
  assert.equal(sessionRingState(session("a", "stale"), NONE), "stale");
  // A reply ending in a question is yellow until looked at, however old.
  assert.equal(sessionRingState(session("a", "completed", { replyAsks: true, ...old }), unseen), "yourturn");
  // Looked at (roadmap B15): waiting, asking and failed stop asking and are grey, like a "looked" row.
  assert.equal(sessionRingState(session("a", "waiting"), NONE), "done");
  assert.equal(sessionRingState(session("a", "completed", { replyAsks: true }), NONE), "done");
  assert.equal(sessionRingState(session("a", "failed"), NONE), "done");
  // A failed turn is red until looked at.
  assert.equal(sessionRingState(session("a", "failed", old), unseen), "needs");
  // The ring has no clock of its own: a session stays while the page lists it.
  assert.equal(sessionRingState(session("a", "completed", old), unseen), "done");
  assert.equal(sessionRingState(session("a", "completed", old), NONE), "done");
});

test("the reply status marker decides a finished turn instead of whether it was seen", () => {
  const unseen = new Set(["claudeCode:a"]);
  const old = { updatedAt: NOW - 60 * MINUTE };
  // Waiting for a reply stays yellow until looked at, however old.
  assert.equal(sessionRingState(session("a", "completed", { replyMarker: "yourTurn", ...old }), unseen), "yourturn");
  assert.equal(sessionRingState(session("a", "completed", { replyMarker: "done" }), unseen), "done");
  // Waiting on its own background task still counts as working.
  assert.equal(sessionRingState(session("a", "completed", { replyMarker: "background" }), NONE), "working");
  // A marker only means something on a finished turn.
  assert.equal(sessionRingState(session("a", "running", { replyMarker: "done" }), NONE), "working");
  assert.equal(sessionRingState(session("a", "failed", { replyMarker: "done" }), unseen), "needs");
  // The marker wins over the question guess.
  assert.equal(sessionRingState(session("a", "completed", { replyMarker: "done", replyAsks: true }), unseen), "done");
});

test("counts, segments in ring order and the summary list only states that have sessions", () => {
  const sessions = [
    session("r1", "running"),
    session("w1", "waiting"),
    session("r2", "running"),
    session("old", "completed", { updatedAt: NOW - 60 * MINUTE }),
  ];
  const counts = sessionRingCounts(sessions, new Set(["claudeCode:w1"]));
  assert.deepEqual(counts, { needs: 1, yourturn: 0, working: 2, stale: 0, done: 1, total: 4 });
  assert.deepEqual(sessionRingSegments(counts), [
    { value: 1, color: color("needs") },
    { value: 2, color: color("working") },
    { value: 1, color: color("done") },
  ]);
  assert.equal(sessionRingSummary(counts, zhCN), "等你确认 1 · 运行 2 · 完成 1");
  assert.equal(sessionRingSummary(counts, en), "Needs you 1 · Running 2 · Done 1");
  assert.equal(sessionRingSummary(sessionRingCounts([], NONE), en), en.empty);
});

test("card names up to three sessions waiting on you, those needing you first", () => {
  const sessions = [
    session("y1", "completed", { title: "写测试", replyAsks: true }),
    session("n1", "waiting", { title: "修复登录" }),
    session("y2", "completed", { title: "x".repeat(45), cwd: null, replyAsks: true }),
    session("n2", "waiting", { title: null, cwd: null }),
    session("y3", "completed", { replyAsks: true }),
  ];
  const unseen = new Set(["claudeCode:y1", "claudeCode:n1", "claudeCode:y2", "claudeCode:n2", "claudeCode:y3"]);
  const lines = sessionRingCardLines(sessions, unseen, zhCN);
  assert.deepEqual(lines, [
    "等你确认 2 · 等你回复 3",
    "等你确认：修复登录 · fly-island",
    "等你确认：n2",
    "等你回复：写测试 · fly-island",
  ]);
  const long = sessionRingCardLines([sessions[2]], unseen, en);
  assert.equal(long[1], `Your turn: ${"x".repeat(40)}…`);
});

test("the pixel grid lights one cell per session in ring order, with a plus past nine", () => {
  const counts = { needs: 1, yourturn: 0, working: 2, stale: 1, done: 1, total: 5 };
  assert.deepEqual(sessionGridCells(counts), ["needs", "working", "working", "stale", "done"]);
  const nine = { needs: 0, yourturn: 0, working: 9, stale: 0, done: 0, total: 9 };
  assert.deepEqual(sessionGridCells(nine), Array(9).fill("working"));
  const many = { needs: 2, yourturn: 3, working: 6, stale: 0, done: 4, total: 15 };
  const cells = sessionGridCells(many);
  assert.equal(cells.length, SESSION_GRID_MAX);
  // The least urgent are the ones left off; the last cell says there are more.
  assert.deepEqual(cells, ["needs", "needs", "yourturn", "yourturn", "yourturn", "working", "working", "working", "more"]);
  assert.deepEqual(sessionGridCells(sessionRingCounts([], NONE)), []);
});

test("signal bars: a column per colour with sessions, least urgent left, a bar per session", () => {
  const counts = { needs: 1, yourturn: 0, working: 2, stale: 1, done: 3, total: 7 };
  assert.deepEqual(sessionSignal(counts), {
    columns: [
      { key: "done", bars: ["done", "done", "done"] },
      // Silent running sessions are dimmed bars on top of the green column.
      { key: "working", bars: ["working", "working", "stale"] },
      { key: "needs", bars: ["needs"] },
    ],
    slots: 5,
    bar: 3,
  });
  const six = sessionSignal({ needs: 0, yourturn: 6, working: 1, stale: 0, done: 0, total: 7 });
  assert.deepEqual([six.slots, six.bar], [6, 2], "past five in a column, every column gets more, thinner bars");
  const crowd = sessionSignal({ needs: 0, yourturn: 0, working: 12, stale: 0, done: 0, total: 12 });
  assert.equal(crowd.columns[0].bars.length, SESSION_SIGNAL_MAX);
  assert.equal(crowd.slots, SESSION_SIGNAL_MAX);
  assert.deepEqual(sessionSignal(sessionRingCounts([], NONE)).columns, []);
});
