import assert from "node:assert/strict";
import test from "node:test";
import { matchesClipboardQuery } from "../../src/features/clipboard/clipboardSearch.ts";
import { parseExcludedApps } from "../../src/features/clipboard/settings.ts";

const item = (fields) => ({ id: "1", kind: "text", hash: "h", createdAt: 0, copiedAt: 0, preview: "", ...fields });

test("clipboard search looks at the text, files, OCR text and source program", () => {
  assert.ok(matchesClipboardQuery(item({ preview: "Hello", text: "Hello world" }), "world"));
  assert.ok(matchesClipboardQuery(item({ kind: "files", files: ["C:\\docs\\report.pdf"] }), "report"));
  assert.ok(matchesClipboardQuery(item({ kind: "image", ocrText: "Invoice 2026" }), "invoice"));
  assert.ok(matchesClipboardQuery(item({ source: { path: "C:\\x\\Code.exe", name: "Code" } }), "code"));
  assert.ok(!matchesClipboardQuery(item({ text: "abc" }), "xyz"));
});

test("tags need a #word and a masked key is not searched by its text", () => {
  const tagged = item({ text: "deploy notes", tags: ["Work", "ops"] });
  assert.ok(matchesClipboardQuery(tagged, "#work deploy"));
  assert.ok(!matchesClipboardQuery(tagged, "#home"));
  assert.ok(!matchesClipboardQuery(item({ text: "ghp_secret123", masked: true, preview: "ghp_••••" }), "secret123"));
});

test("excluded programs are lower case with .exe", () => {
  assert.deepEqual(parseExcludedApps("KeePass.exe, 1Password ，  ;notepad"), ["keepass.exe", "1password.exe", "notepad.exe"]);
});
