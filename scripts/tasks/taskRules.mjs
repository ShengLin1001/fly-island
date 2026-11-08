// What makes a task file valid (`pnpm check:tasks`), and the group table read from
// docs/tasks/README.md, so the groups are defined in one place that people and
// agents read anyway.
import {
  BODY_SECTIONS, CLOSED_STATUSES, FIELDS, STATUSES, groupOf, isTaskId, sectionItems, sectionText, splitBody,
} from "./taskFile.mjs";

/** The groups in board order, from the `| A | 名称 |` rows under "## 分组" in the README. */
export function parseGroups(readme) {
  const text = readme.replace(/\r\n/g, "\n");
  const start = text.indexOf("\n## 分组");
  if (start === -1) return [];
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end).split("\n")
    .map((line) => /^\|\s*([A-Z])\s*\|\s*([^|]+?)\s*\|/.exec(line))
    .filter(Boolean)
    .map(([, code, name]) => ({ code, name }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NEEDS = ["user"];
/** A link into the repo must start at its root (/docs/...): a task moves to archive/ when it closes. */
const RELATIVE_LINK = /\]\((?!https?:|\/|#|mailto:)[^)]*\)/;

/**
 * Problems with one task; empty when it is fine.
 * `context`: { fileId, archived, folder (the group folder it is in; undefined to skip), tasks: Map id → task,
 * groups: Set of codes, children: Map id → child tasks }.
 */
export function taskProblems(task, { fileId, archived, folder, tasks, groups, children }) {
  const { fields, body } = task;
  const problems = [];
  const closed = CLOSED_STATUSES.includes(fields.status);
  if (fields.id !== fileId) problems.push(`id "${fields.id}" does not match the file name ${fileId}.md`);
  if (!isTaskId(fields.id ?? "")) problems.push(`id "${fields.id}" is not like A7, B6.1.12 or F10`);
  else if (!groups.has(groupOf(fields.id))) problems.push(`group ${groupOf(fields.id)} is not in the README's group table`);
  for (const key of Object.keys(fields)) if (!FIELDS.includes(key)) problems.push(`unknown field "${key}"`);
  if (!fields.title) problems.push("no title");
  if (!STATUSES.includes(fields.status)) problems.push(`status "${fields.status}" is not one of ${STATUSES.join(" / ")}`);
  if (closed && !archived) problems.push(`status ${fields.status} belongs in docs/tasks/archive/`);
  if (!closed && archived) problems.push(`status ${fields.status} is open; move it out of archive/`);
  if (folder !== undefined && isTaskId(fields.id ?? "") && folder !== groupOf(fields.id)) {
    problems.push(`belongs in the ${groupOf(fields.id)}/ folder of ${archived ? "docs/tasks/archive" : "docs/tasks"}`);
  }
  const isParent = (children.get(fields.id) ?? []).length > 0;
  if (fields.status === "进行中" && !fields.owner && !isParent) problems.push("in progress without an owner");
  if ((fields.status === "待做" || closed) && (fields.lane || fields.claimed)) problems.push(`status ${fields.status} keeps a lane or claim time`);
  if (fields.status === "待做" && fields.owner) problems.push("待做 with an owner; claim it or drop the owner");
  if (fields.lane && !/^[0-9]+$/.test(fields.lane)) problems.push(`lane "${fields.lane}" is not a number`);
  for (const other of [...fields.depends, ...(fields.parent ? [fields.parent] : [])]) {
    if (other === fields.id) problems.push("refers to itself");
    else if (!tasks.has(other)) problems.push(`refers to unknown task ${other}`);
  }
  if (fields.needs && !NEEDS.includes(fields.needs)) problems.push(`needs "${fields.needs}" is not one of ${NEEDS.join(" / ")}`);
  if (fields.issue && !/^[0-9]+$/.test(fields.issue)) problems.push(`issue "${fields.issue}" is not an issue number`);
  if (fields.status === "已完成") {
    if (!DATE.test(fields.done ?? "")) problems.push("已完成 without a done date (YYYY-MM-DD)");
    if (sectionItems(body, "提交").length === 0) problems.push("已完成 without a commit under ## 提交");
  } else if (fields.done) problems.push(`status ${fields.status} has a done date`);
  if (fields.status === "不做" && !sectionText(body, "备注")) problems.push("不做 without a reason under ## 备注");
  problems.push(...bodyProblems(body, fields.title ?? ""));
  return problems;
}

function bodyProblems(body, title) {
  const problems = [];
  const { before, sections } = splitBody(body);
  if (before) problems.push(`text above the first heading; put it under ## 说明 (sections: ${BODY_SECTIONS.join(" / ")})`);
  const order = sections.map((section) => BODY_SECTIONS.indexOf(section.name));
  for (const section of sections) if (!section.name) problems.push(`heading "## ${section.heading}" is not one of ${BODY_SECTIONS.join(" / ")}`);
  if (order.some((rank, index) => index > 0 && rank !== -1 && rank < order[index - 1])) problems.push(`sections out of order (${BODY_SECTIONS.join(" → ")})`);
  if (new Set(sections.map((section) => section.name)).size !== sections.length) problems.push("a section appears twice");
  const description = sectionText(body, "说明").split("\n\n")[0].trim();
  if (title && description === title) problems.push("## 说明 starts by repeating the title");
  if (RELATIVE_LINK.test(body)) problems.push("a relative link; write repo links from the root, e.g. (/docs/x.md)");
  return problems;
}

/** Problems across `entries` ({ id, archived, task?, error? }) given the README's groups. */
export function checkEntries(entries, groups) {
  const tasks = new Map();
  const problems = [];
  const label = (entry) => entry.file ?? `${entry.archived ? "archive/" : ""}${entry.id}.md`;
  for (const entry of entries) {
    if (entry.error) problems.push(`${label(entry)}: ${entry.error}`);
    else if (tasks.has(entry.id)) problems.push(`${label(entry)}: id ${entry.id} is used twice`);
    else tasks.set(entry.id, entry.task);
  }
  const children = new Map();
  for (const task of tasks.values()) {
    if (task.fields.parent) children.set(task.fields.parent, [...(children.get(task.fields.parent) ?? []), task]);
  }
  const codes = new Set(groups.map((group) => group.code));
  if (codes.size === 0) problems.push("README.md: no group table under ## 分组");
  for (const entry of entries) {
    if (!entry.task) continue;
    const context = { fileId: entry.id, archived: entry.archived, folder: entry.folder, tasks, groups: codes, children };
    for (const problem of taskProblems(entry.task, context)) problems.push(`${label(entry)}: ${problem}`);
  }
  return problems;
}

/** A commit entry under ## 提交: a commit subject in backticks or a short hash, plus optional words after it. */
export function commitRef(entry) {
  const quoted = /^`([^`]+)`/.exec(entry);
  if (quoted) return /^[0-9a-f]{7,40}$/.test(quoted[1]) ? { hash: quoted[1] } : { subject: quoted[1] };
  const hash = /^([0-9a-f]{7,40})\b/.exec(entry);
  return hash ? { hash: hash[1] } : null;
}
