import assert from "node:assert/strict";
import test from "node:test";
import { allowFromValid, chatLabel, freeProjectName } from "../../src/features/cc-connect/api.ts";

test("a new bot's project takes the first free name", () => {
  assert.equal(freeProjectName([]), "phone");
  assert.equal(freeProjectName(["phone", "phone-2", "work"]), "phone-3");
  assert.equal(freeProjectName(["bot"], "bot"), "bot-2");
});

test("who may use a bot is named, never everyone", () => {
  assert.equal(allowFromValid("123456"), true);
  assert.equal(allowFromValid("123, ou_abc-1"), true);
  for (const open of ["", " ", "*", "1,*", "1,,2", "a b"]) assert.equal(allowFromValid(open), false, open);
});

test("a chat shows its platform and user", () => {
  const chat = { key: "telegram:1:1", platform: "telegram", userName: "ada" };
  assert.equal(chatLabel(chat, { telegram: "Telegram" }), "Telegram · ada");
  assert.equal(chatLabel({ ...chat, platform: "matrix", userName: null }, {}), "matrix");
});
