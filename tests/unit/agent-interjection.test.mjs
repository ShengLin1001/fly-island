import assert from "node:assert/strict";
import test from "node:test";
import { phasesOf } from "../../src/features/agent-status/alerts.ts";
import { interjectingSession, waitingSession } from "../../src/features/agent-status/interjection.ts";

const session = (sessionId, phase, updatedAt = 0, extra = {}) => ({
  provider: "claudeCode", sessionId, cwd: null, title: sessionId, model: null, effort: null,
  phase, lastMessage: null, updatedAt, host: null, turnStartedAt: null, ...extra,
});

test("lyrics give way for a moment when a session starts, finishes or fails", () => {
  const before = phasesOf([session("a", "running"), session("b", "completed")]);
  // The first look only notes where sessions stand.
  assert.equal(interjectingSession(null, [session("a", "completed")]), null);
  assert.equal(interjectingSession(before, [session("a", "completed", 5)])?.sessionId, "a");
  assert.equal(interjectingSession(before, [session("a", "failed", 5)])?.sessionId, "a");
  assert.equal(interjectingSession(before, [session("a", "running"), session("b", "completed"), session("c", "running", 9)])?.sessionId, "c");
});

test("nothing interrupts the lyrics while sessions just carry on", () => {
  const before = phasesOf([session("a", "running"), session("b", "completed")]);
  // Still running, a later turn the user just started, an old session coming into view finished.
  assert.equal(interjectingSession(before, [session("a", "running", 5), session("b", "completed")]), null);
  assert.equal(interjectingSession(before, [session("a", "running"), session("b", "running", 5)]), null);
  assert.equal(interjectingSession(before, [session("a", "running"), session("b", "completed"), session("c", "completed", 9)]), null);
  // A session with no title has nothing to show.
  assert.equal(interjectingSession(before, [session("a", "completed", 5, { title: null })]), null);
});

test("several changes at once show the latest", () => {
  const before = phasesOf([session("a", "running"), session("b", "running")]);
  assert.equal(interjectingSession(before, [session("a", "completed", 7), session("b", "failed", 3)])?.sessionId, "a");
});

test("a session waiting on the user keeps the bar, the latest when several wait", () => {
  assert.equal(waitingSession([session("a", "running"), session("b", "completed")]), null);
  assert.equal(waitingSession([session("a", "waiting", 3), session("b", "waiting", 8), session("c", "running", 9)])?.sessionId, "b");
  assert.equal(waitingSession([session("a", "completed", 3, { replyMarker: "yourTurn" })])?.sessionId, "a");
});
