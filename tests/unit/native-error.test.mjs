import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { errorText, isNativeError } from "../../src/i18n/nativeError.ts";
import * as errors from "../../src/i18n/sections/errors.ts";
import { getErrorMessage } from "../../src/utils/error.ts";

const zh = { errors: errors.zhCN };
const en = { errors: errors.en };

test("a native error is worded in the island's language, what the service said after it", () => {
  const error = { code: "bark.status", args: { status: 500 }, detail: "busy", message: "Bark answered 500." };
  assert.equal(errorText(error, zh), "Bark 返回 500：busy");
  assert.equal(errorText(error, en), "Bark answered 500: busy");
  assert.equal(errorText({ code: "bark.noKey", message: "No Bark device key yet." }, zh), "还没有填 Bark 设备 Key。");
});

test("an unknown code falls back to its English message, and plain errors show as they are", () => {
  assert.equal(errorText({ code: "newer.code", detail: "x", message: "Something new." }, zh), "Something new：x");
  assert.equal(errorText({ code: "plain", message: "旧的报错" }, en), "旧的报错");
  assert.equal(errorText("还是字符串", en), "还是字符串");
  assert.equal(errorText(new Error("boom"), en), "boom");
  assert.equal(isNativeError({ code: 1, message: "x" }), false);
});

test("English text for logs reads the native error too", () => {
  assert.equal(getErrorMessage({ code: "bark.status", detail: "busy", message: "Bark answered 500." }), "Bark answered 500: busy");
  assert.equal(getErrorMessage("plain"), "plain");
});

test("both languages word every code", () => {
  assert.deepEqual(Object.keys(errors.zhCN.codes).sort(), Object.keys(errors.en.codes).sort());
});

test("every code the native side sends has its wording", () => {
  const sent = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".rs")) {
        for (const match of readFileSync(file, "utf8").matchAll(/UserError::new\("([A-Za-z.]+)"/g)) sent.add(match[1]);
      }
    }
  };
  walk("src-tauri/src");
  // "plain" is a message not given a code yet; the user_error.rs tests use codes of their own.
  const missing = [...sent].filter((code) => code !== "plain" && !(code in errors.en.codes));
  assert.deepEqual(missing, []);
});
