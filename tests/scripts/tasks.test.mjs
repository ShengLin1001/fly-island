import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { boardLines, claimable, jsonRows, nextLines, relationLines } from "../../scripts/tasks/taskBoard.mjs";
import {
  addHandoff, addLine, claimState, claimed, filesInScope, formatTask, parseTask, scopeOverlap, sectionItems, unclaimed,
} from "../../scripts/tasks/taskFile.mjs";
import { doneProblems } from "../../scripts/tasks/taskLanding.mjs";
import { checkEntries, commitRef, parseGroups } from "../../scripts/tasks/taskRules.mjs";
import { checkTasks, staleReason } from "../../scripts/tasks/tasks.mjs";

const README = "# 任务\n\n## 分组\n\n| 分组 | 名称 | 放什么 |\n|---|---|---|\n| A | Agent 会话定位 | x |\n| F | 多会话协作 | y |\n\n## 头部字段\n\n| `id` | 和文件名一致 |\n";
const GROUPS = parseGroups(README);
const TEXT = "---\r\nid: F1\r\ntitle: 认领脚本\r\nstatus: 待做\r\nscope: scripts/, docs/tasks/\r\n---\r\n\r\n## 说明\r\n\r\n说明：a: b\r\n";

function task(id, fields = {}, body = "") {
  return { fields: { id, title: `任务 ${id}`, status: "待做", scope: [], depends: [], ...fields }, body };
}

function done(id, fields = {}, commit = "`feat(x): y`") {
  return task(id, { status: "已完成", owner: "s", done: "2026-11-09", ...fields }, `## 提交\n\n- ${commit}`);
}

/** Problems for tasks given as [task, archived?]; files are named after the ids. */
function problems(...entries) {
  return checkEntries(entries.map(([t, archived = false]) => ({ id: t.fields.id, archived, task: t })), GROUPS);
}

test("task files round-trip; empty optional fields are left out", () => {
  const parsed = parseTask(TEXT);
  assert.deepEqual(parsed.fields.scope, ["scripts/", "docs/tasks/"]);
  assert.deepEqual(parsed.fields.depends, []);
  assert.equal(parsed.body, "## 说明\n\n说明：a: b");
  const again = formatTask(parsed);
  assert.ok(!again.includes("\r"));
  assert.ok(!again.includes("depends:"), "an empty list is not written");
  assert.deepEqual(parseTask(again), parsed);
  assert.throws(() => parseTask("no front matter"), /front matter/);
});

test("body lines go into their section, which is created in template order", () => {
  let body = addHandoff("## 说明\n\nx", "下一步：写测试");
  assert.equal(body, "## 说明\n\nx\n\n## 交接\n\n- 下一步：写测试");
  body = addLine(body, "提交", "`feat(a): b`");
  assert.equal(body, "## 说明\n\nx\n\n## 提交\n\n- `feat(a): b`\n\n## 交接\n\n- 下一步：写测试");
  body = addLine(addHandoff(body, "第二条"), "提交", "abc1234");
  assert.deepEqual(sectionItems(body, "提交"), ["`feat(a): b`", "abc1234"]);
  assert.deepEqual(sectionItems(body, "交接"), ["下一步：写测试", "第二条"]);
});

test("claiming: free, mine in my lane, theirs elsewhere; giving back clears the claim", () => {
  const free = parseTask(TEXT);
  assert.equal(claimState(free, 7), "free");
  const mine = claimed(free, { owner: "s", lane: 7, at: "2026-11-07 02:00" });
  assert.equal(mine.fields.status, "进行中");
  assert.equal(claimState(mine, 7), "mine");
  assert.equal(claimState(mine, 3), "theirs");
  assert.deepEqual(mine.fields.scope, ["scripts/", "docs/tasks/"], "no --scope keeps the declared one");
  assert.deepEqual(unclaimed(mine, "待做").fields, { ...free.fields, status: "待做" });
});

test("stale claims: lane gone, its session exited, or a quiet day", () => {
  const claim = claimed(parseTask(TEXT), { owner: "s", lane: 7, at: "2026-11-07 02:00" });
  const now = Date.parse("2026-11-07T03:00");
  assert.match(staleReason(claim, { laneExists: false, now }), /不存在/);
  assert.match(staleReason(claim, { laneExists: true, ownerPidAlive: false, now }), /退出/);
  assert.equal(staleReason(claim, { laneExists: true, ownerPidAlive: true, now }), null);
  const later = Date.parse("2026-11-08T03:00");
  assert.match(staleReason(claim, { laneExists: true, ownerPidAlive: null, now: later }), /24 小时/);
  assert.equal(staleReason(claim, { laneExists: true, ownerPidAlive: null, lastLaneCommitMs: later - 1000, now: later }), null);
  assert.equal(staleReason(parseTask(TEXT), { laneExists: false, now }), null, "free tasks are never stale");
});

test("scopes overlap by file or folder; changed files fall in a scope", () => {
  assert.deepEqual(scopeOverlap(["scripts/"], ["scripts/tasks/tasks.mjs", "src/"]), ["scripts/"]);
  assert.deepEqual(scopeOverlap(["docs/a.md"], ["docs/b.md"]), []);
  assert.deepEqual(filesInScope(["scripts/x.mjs", "src/y.ts"], ["scripts/"]), ["scripts/x.mjs"]);
});

test("the group table is read from the README, in order, and stops at the next heading", () => {
  assert.deepEqual(GROUPS, [{ code: "A", name: "Agent 会话定位" }, { code: "F", name: "多会话协作" }]);
  assert.deepEqual(parseGroups("# 没有分组\n"), []);
});

test("check accepts well-formed open, done and dropped tasks", () => {
  const dropped = task("A2", { status: "不做" }, "## 备注\n\n- 2026-11-09 不做：太窄");
  const parent = task("F2", { status: "进行中" }, "## 说明\n\n见 [方案](/docs/x.md)");
  const child = task("F2.1", { parent: "F2", depends: ["A1"] });
  assert.deepEqual(problems([task("F1")], [done("A1"), true], [dropped, true], [parent], [child]), []);
});

test("check reports each broken rule", () => {
  const cases = [
    [[task("Z1")], /group Z/],
    [[{ ...task("F1"), fields: { ...task("F1").fields, section: "x" } }], /unknown field "section"/],
    [[done("F1")], /belongs in docs\/tasks\/archive/],
    [[task("F1"), true], /move it out of archive/],
    [[done("F1", { done: "" }), true], /done date/],
    [[{ ...done("F1"), body: "" }, true], /## 提交/],
    [[task("F1", { status: "不做" }), true], /reason/],
    [[task("F1", { owner: "s" })], /待做 with an owner/],
    [[task("F1", { status: "进行中" })], /without an owner/],
    [[task("F1", { depends: ["F9"] })], /unknown task F9/],
    [[task("F1", { needs: "me" })], /needs "me"/],
    [[task("F1", { issue: "#13" })], /issue/],
    [[task("F1", {}, "开头的字")], /above the first heading/],
    [[task("F1", {}, "## 说明\n\n任务 F1")], /repeating the title/],
    [[task("F1", {}, "## 交接\n\n- a\n\n## 说明\n\nb")], /out of order/],
    [[task("F1", {}, "## 想法\n\nb")], /not one of/],
    [[task("F1", {}, "## 说明\n\n[a](architecture/x.md)")], /relative link/],
  ];
  for (const [entry, pattern] of cases) {
    const found = problems(entry);
    assert.ok(found.some((problem) => pattern.test(problem)), `${pattern} in ${JSON.stringify(found)}`);
  }
  assert.ok(problems([task("F1")], [done("F1"), true]).some((problem) => /used twice/.test(problem)));
});

test("check reads both folders and the README of a repo", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tasks-"));
  mkdirSync(path.join(root, "docs/tasks/archive"), { recursive: true });
  writeFileSync(path.join(root, "docs/tasks/README.md"), README);
  writeFileSync(path.join(root, "docs/tasks/F1.md"), TEXT);
  writeFileSync(path.join(root, "docs/tasks/archive/A1.md"), formatTask(done("A1")));
  assert.deepEqual(checkTasks(root), []);
  writeFileSync(path.join(root, "docs/tasks/F2.md"), "oops");
  assert.equal(checkTasks(root).length, 1);
});

const stale = (t) => (t.fields.owner === "gone" ? "lane 3 已不存在" : null);

test("the board lists the user's tasks first, then groups in order, with children under their parent", () => {
  const tasks = [
    task("F1", { status: "进行中", owner: "s", lane: "2" }),
    task("F3", { status: "进行中" }),
    task("F3.1", { parent: "F3", depends: ["F1"] }),
    done("F3.2", { parent: "F3" }),
    task("A6", { needs: "user", issue: "13" }),
    task("A7", {}, "## 交接\n\n- 下一步"),
    done("A1"),
  ];
  const lines = boardLines(tasks, { groups: GROUPS, stale });
  const ids = lines.map((line) => line.trim().split(/\s+/)[0]).filter((word) => /^[A-Z][0-9]/.test(word));
  assert.deepEqual(ids, ["A6", "A7", "F1", "F3", "F3.1"], "closed tasks are left out; F3.1 nests under F3");
  const text = lines.join("\n");
  assert.match(text, /## 需要你（1）[\s\S]*A6 +待做 · 需要你本人 · #13/);
  assert.match(text, /## A Agent 会话定位[\s\S]*A7 +待做 · 有交接/);
  assert.match(text, /F3 +进行中 · 子任务 1\/2/);
  assert.match(text, /\n {4}F3\.1 +待做 · 等 F1/);
  assert.ok(boardLines(tasks, { groups: GROUPS, stale, all: true }).join("\n").includes("A1"));
  const rows = jsonRows(tasks, { stale });
  assert.deepEqual(rows.find((row) => row.id === "F3.1").blockedBy, ["F1"]);
  assert.equal(rows.find((row) => row.id === "A6").needsUser, true);
});

test("next offers what an agent can claim, and stale claims to take over", () => {
  const tasks = [
    task("F2"),
    task("A3"),
    task("A6", { needs: "user" }),
    task("F3", { depends: ["F2"] }),
    task("F4"),
    task("F4.1", { parent: "F4" }),
    task("F5", { status: "进行中", owner: "gone", lane: "3" }),
  ];
  assert.deepEqual(claimable(tasks, GROUPS).map((t) => t.fields.id), ["A3", "F2", "F4.1"]);
  const text = nextLines(tasks, { groups: GROUPS, stale }).join("\n");
  assert.match(text, /task:claim A3/);
  assert.match(text, /F5 +gone：lane 3 已不存在/);
});

test("show lists the parent, children, dependencies, dependents and linked files", () => {
  const parent = task("F3", { status: "进行中" }, "## 说明\n\n见 [a](/docs/a.md) 和 [b](/docs/b.md#x)");
  const tasks = [parent, task("F3.1", { parent: "F3" }), task("F4", { depends: ["F3"] })];
  const text = relationLines(parent, tasks, { exists: (link) => link === "docs/a.md" }).join("\n");
  assert.match(text, /子任务（0\/1 已结束）/);
  assert.match(text, /依赖它的任务：\n {2}F4/);
  assert.match(text, /docs\/a\.md\n {2}docs\/b\.md（不存在）/);
});

test("commit entries are a subject in backticks or a hash", () => {
  assert.deepEqual(commitRef("`feat(a): b, c` 等 2 个"), { subject: "feat(a): b, c" });
  assert.deepEqual(commitRef("`abc1234`"), { hash: "abc1234" });
  assert.deepEqual(commitRef("abc1234 的后半"), { hash: "abc1234" });
  assert.equal(commitRef("同 B6.1.1"), null);
});

test("a landing that marks tasks done must name commits that exist", () => {
  const facts = {
    changed: new Set(["F1", "F2", "F3", "F4", "F5"]),
    landing: ["feat(x): y"],
    history: ["fix(old): z"],
    commitExists: (hash) => hash === "abc1234",
    wasDone: (id) => id === "F5",
  };
  const tasks = [
    done("F1"),
    done("F2", {}, "`fix(old): z`"),
    done("F3", {}, "`feat(typo): y`"),
    done("F4", {}, "deadbee"),
    done("F5", {}, "没有提交号"),
    done("F6", {}, "没有提交号"),
  ];
  const found = doneProblems(tasks, facts);
  assert.equal(found.length, 2, found.join("\n"));
  assert.match(found[0], /F3 .*feat\(typo\): y/);
  assert.match(found[1], /F4 .*deadbee/);
  assert.match(doneProblems([done("F1", {}, "同 F0")], facts)[0], /没有提交标题/);
});
