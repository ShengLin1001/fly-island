// What `pnpm tasks`, `pnpm tasks next` and `pnpm tasks show` print. Pure functions over
// the parsed tasks; `stale(task)` says why a claim no longer holds (taskRepo.mjs).
import { CLOSED_STATUSES, OPEN_STATUSES, compareIds, groupOf, sectionText } from "./taskFile.mjs";

/** Tasks by id, with each task's children. */
export function index(tasks) {
  const byId = new Map(tasks.map((task) => [task.fields.id, task]));
  const children = new Map();
  for (const task of tasks) {
    const parent = task.fields.parent;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), task].sort((a, b) => compareIds(a.fields.id, b.fields.id)));
  }
  return { byId, children };
}

/** The dependencies of `task` that are still open. */
export function blockers(task, byId) {
  return task.fields.depends.filter((id) => byId.has(id) && !CLOSED_STATUSES.includes(byId.get(id).fields.status));
}

/** `{ done, total }` over a parent's children, or null for a task without any. */
export function progress(task, children) {
  const list = children.get(task.fields.id) ?? [];
  if (list.length === 0) return null;
  return { done: list.filter((child) => CLOSED_STATUSES.includes(child.fields.status)).length, total: list.length };
}

/** Whether the task is the user's own: only they can do it, or it waits for their answer. */
export function forUser(task) {
  return task.fields.needs === "user" || task.fields.status === "待用户确认";
}

function hasHandoff(task) {
  return Boolean(sectionText(task.body, "交接"));
}

function orderBy(groups) {
  const rank = (task) => {
    const index = groups.findIndex((group) => group.code === groupOf(task.fields.id));
    return index === -1 ? groups.length : index;
  };
  return (a, b) => rank(a) - rank(b) || compareIds(a.fields.id, b.fields.id);
}

/** One row per task for `pnpm tasks --json` (read by the island's task board plugin). */
export function jsonRows(tasks, { stale, all = false }) {
  const { byId, children } = index(tasks);
  return tasks
    .filter((task) => all || OPEN_STATUSES.includes(task.fields.status))
    .map((task) => ({
      ...task.fields,
      group: groupOf(task.fields.id),
      stale: stale(task),
      handoff: hasHandoff(task),
      needsUser: forUser(task),
      blockedBy: blockers(task, byId),
      children: progress(task, children),
    }));
}

function marks(task, { byId, children, stale }) {
  const parts = [];
  const { owner, lane, issue, needs } = task.fields;
  if (owner) parts.push(`${owner}${lane ? ` · lane ${lane}` : ""}`);
  const reason = stale(task);
  if (reason) parts.push(`⚠ ${reason}`);
  const counts = progress(task, children);
  if (counts) parts.push(`子任务 ${counts.done}/${counts.total}`);
  const waiting = blockers(task, byId);
  if (waiting.length) parts.push(`等 ${waiting.join("、")}`);
  if (needs === "user") parts.push("需要你本人");
  if (issue) parts.push(`#${issue}`);
  if (hasHandoff(task)) parts.push("有交接");
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function rows(task, context, depth) {
  const pad = "  ".repeat(depth + 1);
  const lines = [`${pad}${task.fields.id.padEnd(9)} ${task.fields.status}${marks(task, context)}`, `${pad}${" ".repeat(10)}${task.fields.title}`];
  for (const child of context.children.get(task.fields.id) ?? []) {
    if (context.shown.has(child.fields.id)) lines.push(...rows(child, context, depth + 1));
  }
  return lines;
}

/** The board: what needs the user first, then each group in the README's order; children under their parent. */
export function boardLines(tasks, { groups, stale, all = false }) {
  const { byId, children } = index(tasks);
  const listed = tasks.filter((task) => all || OPEN_STATUSES.includes(task.fields.status)).sort(orderBy(groups));
  const yours = (task) => forUser(task) && OPEN_STATUSES.includes(task.fields.status);
  const mine = listed.filter(yours);
  const grouped = listed.filter((task) => !yours(task));
  const shown = new Set(grouped.map((task) => task.fields.id));
  const context = { byId, children, stale, shown };
  const top = (task) => !task.fields.parent || !shown.has(task.fields.parent);
  const lines = [];
  if (mine.length) {
    lines.push("", `## 需要你（${mine.length}）`);
    for (const task of mine) lines.push(...rows(task, { ...context, shown: new Set() }, 0));
  }
  const names = new Map(groups.map((group) => [group.code, group.name]));
  let current = null;
  for (const task of grouped.filter(top)) {
    const code = groupOf(task.fields.id);
    if (code !== current) {
      current = code;
      lines.push("", `## ${code} ${names.get(code) ?? "（README 里没有这个分组）"}`);
    }
    lines.push(...rows(task, context, 0));
  }
  if (lines.length === 0) lines.push("没有未完成的任务。");
  return lines;
}

/** What an agent can claim now: 待做, not the user's own, nothing it waits on, not a parent of open work. In board order. */
export function claimable(tasks, groups) {
  const { byId, children } = index(tasks);
  return tasks
    .filter((task) => task.fields.status === "待做" && !forUser(task) && blockers(task, byId).length === 0)
    .filter((task) => !(children.get(task.fields.id) ?? []).some((child) => OPEN_STATUSES.includes(child.fields.status)))
    .sort(orderBy(groups));
}

export function nextLines(tasks, { groups, stale }) {
  const free = claimable(tasks, groups);
  const takeover = tasks.filter((task) => task.fields.status === "进行中" && stale(task));
  const lines = [];
  if (free.length === 0 && takeover.length === 0) return ["现在没有能认领的任务。`pnpm tasks` 看看其余的在等什么。"];
  if (free.length) {
    lines.push("能认领的任务（按优先级）：");
    for (const task of free) lines.push(`  ${task.fields.id.padEnd(9)} ${task.fields.title}`);
    lines.push("", `认领：pnpm task:claim ${free[0].fields.id} --as <会话名> --scope <要改的目录/,文件>；先 pnpm tasks show ${free[0].fields.id} 读全文`);
  }
  if (takeover.length) {
    lines.push("", "认领已失效、可以接手的（先给原会话发消息，再加 --takeover）：");
    for (const task of takeover) lines.push(`  ${task.fields.id.padEnd(9)} ${task.fields.owner}：${stale(task)}`);
  }
  return lines;
}

/** Repo paths linked from the body, e.g. /docs/architecture/x.md. */
export function linkedPaths(body) {
  return [...body.matchAll(/\]\((\/[^)#\s]+)/g)].map((match) => match[1].slice(1));
}

/** The relations `pnpm tasks show` adds below the file: parent, children, dependencies, dependents. */
export function relationLines(task, tasks, { exists }) {
  const { byId, children } = index(tasks);
  const line = (other) => `  ${other.fields.id.padEnd(9)} ${other.fields.status.padEnd(5)} ${other.fields.title}`;
  const lines = [];
  const parent = byId.get(task.fields.parent);
  if (parent) lines.push("父任务：", line(parent));
  const kids = children.get(task.fields.id) ?? [];
  if (kids.length) {
    const counts = progress(task, children);
    lines.push(`子任务（${counts.done}/${counts.total} 已结束）：`, ...kids.map(line));
  }
  const deps = task.fields.depends.map((id) => byId.get(id)).filter(Boolean);
  if (deps.length) lines.push("依赖：", ...deps.map(line));
  const dependents = tasks.filter((other) => other.fields.depends.includes(task.fields.id));
  if (dependents.length) lines.push("依赖它的任务：", ...dependents.map(line));
  const links = linkedPaths(task.body);
  if (links.length) lines.push("正文链接的文件：", ...links.map((link) => `  ${link}${exists(link) ? "" : "（不存在）"}`));
  return lines;
}
