import assert from "node:assert/strict";
import test from "node:test";
import { createPageHoverGate, pageHoverMoved, PAGE_SWITCH_SETTLE_MS, settlePageHover } from "../../src/windows/island/pageHoverGate.ts";

test("a pointer that moves onto a page button may switch pages", () => {
  const gate = createPageHoverGate();
  assert.equal(pageHoverMoved(gate, 10, 10, 0), true);
  assert.equal(pageHoverMoved(gate, 14, 10, 5), true);
});

test("a button sliding under a resting pointer does not switch pages back and forth", () => {
  const gate = createPageHoverGate();
  assert.equal(pageHoverMoved(gate, 100, 12, 0), true);
  settlePageHover(gate, 10);
  // The island resizes and another button arrives under the pointer: same spot, no switch.
  assert.equal(pageHoverMoved(gate, 100, 12, 20), false);
  assert.equal(pageHoverMoved(gate, 100, 12, 2_000), false);
  // The user moves the pointer: it counts again.
  assert.equal(pageHoverMoved(gate, 103, 12, 2_010), true);
});

test("moving while the island still resizes waits until it has settled", () => {
  const gate = createPageHoverGate();
  settlePageHover(gate, 1_000);
  assert.equal(pageHoverMoved(gate, 50, 12, 1_100), false);
  assert.equal(pageHoverMoved(gate, 60, 12, 1_000 + PAGE_SWITCH_SETTLE_MS - 1), false);
  assert.equal(pageHoverMoved(gate, 61, 12, 1_000 + PAGE_SWITCH_SETTLE_MS), true);
});
