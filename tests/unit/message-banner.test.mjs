import assert from "node:assert/strict";
import test from "node:test";
import { addBannerMessage, bannerClock, bannerKey, isBannerSource } from "../../src/features/messages/banner/bannerMessages.ts";

const message = (source, receivedAt, title = "小林") => ({ source, title, body: "下午一起开会吗？", receivedAt, durationMs: 5_000, actions: [] });

test("a banner starts with the first message and groups the ones that follow", () => {
  const first = addBannerMessage(null, message("qq", 100));
  assert.equal(first.more, 0);
  assert.equal(first.message.receivedAt, 100);

  const second = addBannerMessage(first, message("qqMail", 200, "项目组"));
  assert.equal(second.more, 1);
  assert.equal(second.message.source, "qqMail");
  assert.ok(second.version > first.version);

  const third = addBannerMessage(second, message("plugin", 300, "构建完成"));
  assert.equal(third.more, 2);
  assert.equal(third.message.title, "构建完成");
});

test("the same arrival seen again leaves the banner as it is", () => {
  const banner = addBannerMessage(null, message("qq", 100));
  assert.equal(addBannerMessage(banner, message("qq", 100)), banner);
  assert.equal(bannerKey(message("qq", 100)), bannerKey(message("qq", 100, "别人")));
  assert.notEqual(bannerKey(message("qq", 100)), bannerKey(message("qqMail", 100)));
});

test("WeChat keeps its one-line preview", () => {
  assert.equal(isBannerSource("wechat"), false);
  for (const source of ["qq", "qqMail", "plugin"]) assert.equal(isBannerSource(source), true);
});

test("the arrival time reads as a 24-hour clock", () => {
  assert.equal(bannerClock(new Date(2026, 10, 9, 9, 5).getTime()), "09:05");
  assert.equal(bannerClock(new Date(2026, 10, 9, 23, 41).getTime()), "23:41");
});
