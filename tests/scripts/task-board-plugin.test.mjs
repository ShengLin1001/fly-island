// The dev task board (scripts/tasks/island-plugin) under the mock host, reading a small
// task folder of its own: the groups, their icons, and what each row says.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startMockHost } from "../../packages/fly-island-plugin/src/test/index.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
// Under the pre-push hook git sets GIT_DIR and friends, which would point the fixture's
// git calls (and the plugin's tasks.mjs) at this repository and its lanes.
for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];
const windowsOnly = { skip: process.platform !== "win32" && "the plugin runs on Windows PowerShell" };
const today = new Date();
const pad = (n) => String(n).padStart(2, "0");
const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

function task(dir, id, fields, body = "") {
  const lines = ["---", `id: ${id}`, ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "---", "", body].join("\n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), `${lines}\n`);
}

/** A copy of the plugin, and a repo with the task scripts and a few tasks of its own. */
function fixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "task-board-"));
  const plugin = path.join(base, "plugin");
  cpSync(path.join(ROOT, "scripts/tasks/island-plugin"), plugin, { recursive: true });
  mkdirSync(path.join(plugin, "lib"));
  copyFileSync(path.join(ROOT, "plugins/examples/dev.focusd.github-issues/lib/focusd.ps1"), path.join(plugin, "lib/focusd.ps1"));
  const repo = path.join(base, "repo");
  cpSync(path.join(ROOT, "scripts"), path.join(repo, "scripts"), { recursive: true });
  cpSync(path.join(ROOT, "docs/tasks/README.md"), path.join(repo, "docs/tasks/README.md"));
  const tasks = path.join(repo, "docs/tasks");
  task(path.join(tasks, "C"), "C1", { title: "日历第二步", status: "进行中", owner: "fly-island-aa", lane: "4", claimed: `${day} 00:00`, issue: "17" });
  task(path.join(tasks, "C"), "C2", { title: "等第一步", status: "待做", depends: "C1" });
  task(path.join(tasks, "D"), "D1", { title: "换电脑实测", status: "待做", needs: "user" });
  task(path.join(tasks, "0-archive/D"), "D2", { title: "今天修好的", status: "已完成", done: day }, "## 提交\n\n- `fix: x`\n");
  // tasks.mjs finds the repository through git.
  execFileSync("git", ["init", "-q"], { cwd: repo });
  return { base, plugin, repo };
}

test("the board groups the tasks, marks each group with an icon and keeps the title on its own", windowsOnly, async () => {
  const { base, plugin, repo } = fixture();
  const host = startMockHost(plugin, { settings: { repo, minutes: 30 }, timeoutMs: 60000 });
  try {
    host.viewVisible("tasks");
    const model = await host.waitForView("tasks", (m) => Array.isArray(m.groups) && m.groups.length > 0 && !m.loading);
    // The fixture has no lane 4, so C1's claim counts as stale.
    assert.deepEqual(model.groups.map((group) => group.title), ["需要你 1", "认领已失效 1", "待做 1", "今天完成 1"], JSON.stringify(model));
    const [needs, stale, todo, finished] = model.groups.map((group) => group.items[0]);
    assert.equal(needs.icon, "bell");
    assert.match(needs.subtitle, /^D1 · 需要你本人$/);
    assert.equal(stale.title, "日历第二步", "the title stands alone, the id moves to the line under it");
    assert.equal(stale.icon, "flame");
    assert.match(stale.subtitle, /^C1 · fly-island-aa · lane 4 · \d+(分钟|小时)前 · lane 4 已不存在$/);
    assert.equal(stale.note, "#17");
    assert.equal(todo.icon, "clock", "a task that waits on another shows a clock");
    assert.match(todo.subtitle, /等 C1/);
    assert.equal(finished.icon, "circle-check");
    assert.equal(finished.title, "今天修好的");
  } finally {
    await host.stop();
    rmSync(base, { recursive: true, force: true });
  }
});
