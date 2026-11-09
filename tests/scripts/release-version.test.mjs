import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { channelProblems, parseTask, RELEASED_MARKER, releasedComment, shippedIssues } from "../../scripts/release/after-release.mjs";
import { commandLine, quoteArg } from "../../scripts/release/command-line.mjs";
import { baseTag, DRAFT_MARKER, draftNotes, userFacingCommits } from "../../scripts/release/notes-draft.mjs";
import { bumpProblem, readVersion, VERSION_FILES, writeVersion } from "../../scripts/release/versions.mjs";

test("the four version files of this repository agree and can be read", () => {
  const found = Object.entries(VERSION_FILES).map(([kind, path]) => readVersion(kind, readFileSync(path, "utf8")));
  assert.ok(found.every((version) => version && version === found[0]), found.join(", "));
});

test("setting a version changes only the version text", () => {
  const lock = "[[package]]\r\nname = \"fnv\"\r\nversion = \"1.0.7\"\r\n\r\n[[package]]\r\nname = \"focusd-island\"\r\nversion = \"0.3.3\"\r\ndependencies = [\r\n";
  assert.equal(writeVersion("cargoLock", lock, "0.3.4-beta.1"), lock.replace('version = "0.3.3"', 'version = "0.3.4-beta.1"'));
  const toml = '[package]\nname = "focusd-island"\nversion = "0.3.3"\n\n[dependencies]\nserde = { version = "1" }\n';
  assert.equal(writeVersion("cargo", toml, "0.3.4"), toml.replace('"0.3.3"', '"0.3.4"'));
  const json = '{\n  "name": "fly-island",\n  "version": "0.3.3",\n  "dependencies": { "x": "1.0.0" }\n}\n';
  assert.equal(writeVersion("package", json, "0.3.4"), json.replace("0.3.3", "0.3.4"));
  assert.throws(() => writeVersion("cargoLock", "[[package]]\nname = \"other\"\nversion = \"1\"\n", "0.3.4"));
});

test("the next version must be a version and newer than every release", () => {
  const tags = ["v0.3.2", "v0.3.3-beta.1", "v0.3.3", "sdk-v0.4.0"];
  assert.equal(bumpProblem("0.3.4", tags), null);
  assert.equal(bumpProblem("0.3.4-beta.1", tags), null);
  assert.match(bumpProblem("0.3.3", tags), /not newer/);
  assert.match(bumpProblem("0.3.3-beta.2", tags), /not newer/);
  assert.match(bumpProblem("v1", tags), /not a version/);
});

test("notes count from the last release, a final one from the last final one", () => {
  const tags = ["v0.3.2", "v0.3.3-beta.1", "v0.3.3-beta.2", "v0.3.3", "v0.3.4-beta.1"];
  assert.equal(baseTag("0.3.4-beta.2", tags), "v0.3.4-beta.1");
  assert.equal(baseTag("0.3.4", tags), "v0.3.3");
  assert.equal(baseTag("0.3.3", ["v0.3.2", "v0.3.3-beta.1"]), "v0.3.2");
  assert.equal(baseTag("0.1.0", []), null);
});

test("the draft lists user-facing commits and carries the marker", () => {
  const commits = [
    { hash: "a1", subject: "feat(mail): links open" },
    { hash: "b2", subject: "fix: crash on start" },
    { hash: "c3", subject: "feat(tooling): task board" },
    { hash: "d4", subject: "docs(design): notes" },
    { hash: "e5", subject: "chore(release): 0.3.3" },
  ];
  assert.deepEqual(userFacingCommits(commits).map(({ hash }) => hash), ["a1", "b2"]);
  const beta = draftNotes("0.3.4-beta.2", "v0.3.4-beta.1", commits);
  assert.ok(beta.startsWith(DRAFT_MARKER) && beta.includes("这是 0.3.4 的第二个测试版") && beta.includes("the second beta of 0.3.4"));
  assert.ok(beta.includes("- a1 feat(mail): links open") && !beta.includes("task board"));
  const final = draftNotes("0.3.4", "v0.3.3", commits);
  assert.ok(final.includes("0.3.4 正式版，包含 v0.3.3 以来的全部改动") && final.includes("fly-island_0.3.4_x64-setup.exe") && !final.includes("numeric"));
});

test("after a release both channels must offer what they should", () => {
  assert.deepEqual(channelProblems("0.3.4", { stable: "0.3.4", beta: "0.3.4" }), []);
  assert.deepEqual(channelProblems("0.3.4-beta.1", { stable: "0.3.3", beta: "0.3.4-beta.1" }), []);
  assert.equal(channelProblems("0.3.4", { stable: "0.3.3", beta: "0.3.4" }).length, 1);
  assert.equal(channelProblems("0.3.4-beta.1", { stable: "0.3.4-beta.1", beta: null }).length, 2);
});

test("issues whose task has a commit in the release are told, once per release", () => {
  const task = parseTask("---\nid: D13\ntitle: x\nstatus: 已完成\nissue: 18\n---\n\n## 说明\n\ny\n\n## 提交\n\n- `fix(mail): links in a mail open again when clicked`\n- 88b47ae\n\n## 备注\n\n- `not a commit`\n");
  assert.deepEqual(task, { id: "D13", issue: 18, commits: ["fix(mail): links in a mail open again when clicked", "88b47ae"] });
  const other = { id: "C12", issue: 17, commits: ["feat(island): something else"] };
  const none = { id: "F1", issue: null, commits: ["fix(mail): links in a mail open again when clicked"] };
  const bySubject = shippedIssues([task, other, none], [{ hash: "ffff", subject: "fix(mail): links in a mail open again when clicked" }]);
  assert.deepEqual([...bySubject.keys()], [18]);
  const byHash = shippedIssues([{ ...task, commits: ["88b47ae"] }], [{ hash: "88b47ae0123", subject: "rebased: another subject" }]);
  assert.deepEqual([...byHash.keys()], [18]);
  const comment = releasedComment({ tag: "v0.3.4-beta.1", url: "https://example.com/r", tasks: [{ id: "D13", path: "docs/tasks/0-archive/D/D13.md" }], repo: "TixXin/fly-island" });
  assert.ok(comment.includes("测试版") && comment.includes("docs/tasks/0-archive/D/D13.md") && comment.trimEnd().endsWith(RELEASED_MARKER("v0.3.4-beta.1")));
});

test("commands go through the Windows shell as one quoted line", () => {
  assert.equal(commandLine("gh", ["release", "edit", "v0.3.4", "--latest=false"]), "gh release edit v0.3.4 --latest=false");
  assert.equal(quoteArg(".[].body"), '".[].body"');
  assert.equal(quoteArg("C:\\a folder\\notes.md"), '"C:\\a folder\\notes.md"');
  assert.throws(() => quoteArg('say "hi"'));
});
