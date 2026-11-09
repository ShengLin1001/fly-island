import assert from "node:assert/strict";
import test from "node:test";
import { mailProviderOf, sharedMailProvider } from "../../src/features/messages/mail/mailProvider.ts";

test("mailProviderOf knows the services with a logo by the address's domain", () => {
  assert.equal(mailProviderOf("me@qq.com"), "qq");
  assert.equal(mailProviderOf("Me@Foxmail.com "), "qq");
  assert.equal(mailProviderOf("me@163.com"), "netease");
  assert.equal(mailProviderOf("me@126.com"), "netease");
  assert.equal(mailProviderOf("me@yeah.net"), "netease");
  assert.equal(mailProviderOf("me@gmail.com"), "gmail");
  assert.equal(mailProviderOf("me@outlook.com"), "outlook");
  assert.equal(mailProviderOf("me@hotmail.co.uk"), "outlook");
  assert.equal(mailProviderOf("me@live.cn"), "outlook");
});

test("mailProviderOf gives null for other services and for no address", () => {
  assert.equal(mailProviderOf("me@example.edu.cn"), null);
  assert.equal(mailProviderOf("me@mail.qq.com.evil.io"), null);
  assert.equal(mailProviderOf("me@liveshow.com"), null);
  assert.equal(mailProviderOf(""), null);
  assert.equal(mailProviderOf(null), null);
});

test("sharedMailProvider is the one service of all mailboxes, else null", () => {
  assert.equal(sharedMailProvider(["a@163.com", "b@126.com"]), "netease");
  assert.equal(sharedMailProvider(["a@qq.com", null]), "qq");
  assert.equal(sharedMailProvider(["a@qq.com", "b@gmail.com"]), null);
  assert.equal(sharedMailProvider(["a@qq.com", "b@example.com"]), null);
  assert.equal(sharedMailProvider([]), null);
});
