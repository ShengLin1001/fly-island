import assert from "node:assert/strict";
import test from "node:test";
import { popupIndexAfterKey } from "../../src/features/clipboard/popupKeys.ts";

test("arrows move the clipboard window's selection and wrap round", () => {
  assert.deepEqual(popupIndexAfterKey("ArrowDown", 0, 3, true), { index: 1, paste: false });
  assert.deepEqual(popupIndexAfterKey("ArrowDown", 2, 3, true), { index: 0, paste: false });
  assert.deepEqual(popupIndexAfterKey("ArrowUp", 0, 3, true), { index: 2, paste: false });
  assert.deepEqual(popupIndexAfterKey("End", 0, 3, true), { index: 2, paste: false });
  assert.equal(popupIndexAfterKey("a", 0, 3, true), null);
  assert.equal(popupIndexAfterKey("ArrowDown", 0, 0, true), null);
});

test("digits paste that row only while the search box is empty", () => {
  assert.deepEqual(popupIndexAfterKey("1", 2, 3, true), { index: 0, paste: true });
  assert.deepEqual(popupIndexAfterKey("3", 0, 3, true), { index: 2, paste: true });
  assert.equal(popupIndexAfterKey("4", 0, 3, true), null);
  assert.equal(popupIndexAfterKey("1", 0, 3, false), null);
  assert.equal(popupIndexAfterKey("0", 0, 3, true), null);
});
