import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ARRIVALS, addArrival, arrivalKey, removeArrival } from "../../src/features/messages/arrivals/messageArrivals.ts";

const message = (source, receivedAt, title = "小林") => ({ source, title, body: "下午一起开会吗？", receivedAt, actions: [] });

test("arrivals go on top, newest first", () => {
  let list = addArrival([], message("qq", 100));
  list = addArrival(list, message("qqMail", 200, "项目组"));
  list = addArrival(list, message("plugin", 300, "构建完成"));
  assert.deepEqual(list.map((item) => item.receivedAt), [300, 200, 100]);
});

test("the same arrival seen again leaves the list as it is", () => {
  const list = addArrival([], message("qq", 100));
  assert.equal(addArrival(list, message("qq", 100)), list);
});

test("WeChat keeps a single row, moved up by a newer reminder", () => {
  let list = addArrival([], message("wechat", 100, "微信"));
  list = addArrival(list, message("qq", 200));
  list = addArrival(list, message("wechat", 300, "微信"));
  assert.deepEqual(list.map((item) => `${item.source}:${item.receivedAt}`), ["wechat:300", "qq:200"]);
  assert.equal(arrivalKey(message("wechat", 1)), arrivalKey(message("wechat", 2)));
});

test("a WeChat message read from the chat list is a row of its own, as in QQ", () => {
  let list = addArrival([], { ...message("wechat", 100, "小林"), chat: "a" });
  list = addArrival(list, { ...message("wechat", 200, "小周"), chat: "b" });
  list = addArrival(list, message("wechat", 300, "微信"));
  assert.deepEqual(list.map((item) => item.title), ["微信", "小周", "小林"]);
});

test("the list keeps the newest few and drops a row on request", () => {
  let list = [];
  for (let at = 1; at <= MAX_ARRIVALS + 2; at += 1) list = addArrival(list, message("qq", at));
  assert.equal(list.length, MAX_ARRIVALS);
  assert.equal(list[0].receivedAt, MAX_ARRIVALS + 2);
  const key = arrivalKey(list[0]);
  assert.equal(removeArrival(list, key).length, MAX_ARRIVALS - 1);
});
