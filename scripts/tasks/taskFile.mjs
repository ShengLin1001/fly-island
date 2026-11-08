// One task per file: docs/tasks/<group>/<id>.md while it is open, and
// docs/tasks/archive/<group>/<id>.md once it is done or dropped; the group is the
// id's first letter. A front matter block of `key: value` lines, then a body of
// `## ` sections in a fixed order (BODY_SECTIONS). Two sessions claiming the same
// task edit the same file, so the later land fails its rebase; different tasks never
// touch each other's files. Rules and the group table: docs/tasks/README.md.

export const STATUSES = ["待做", "进行中", "待用户确认", "已完成", "不做"];
export const OPEN_STATUSES = ["待做", "进行中", "待用户确认"];
export const CLOSED_STATUSES = ["已完成", "不做"];

/** Fields in the order they are written. Any other key is an error (taskRules.mjs). */
export const FIELDS = ["id", "title", "status", "owner", "lane", "claimed", "scope", "depends", "parent", "needs", "issue", "done"];
const LIST_FIELDS = ["scope", "depends"];
/** Written even when empty, so a new task file shows what can be filled in. */
const ALWAYS_WRITTEN = ["id", "title", "status"];

/** Body sections, in the order they appear; a heading may add a note in brackets, e.g. 结论（2026-11-08）. */
export const BODY_SECTIONS = ["说明", "验收", "提交", "备注", "结论", "交接"];

const ID = /^[A-Z][0-9]+[a-z]?(\.[0-9]+)*$/;

export function isTaskId(id) {
  return ID.test(id);
}

/** The group code of a task id: its first letter. */
export function groupOf(id) {
  return id.charAt(0);
}

/** Splits a list field written as `a, b`; empty for none. */
export function splitList(value) {
  return String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

/** `{ fields, body }` from a task file's text; throws on a missing or broken front matter. */
export function parseTask(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error("missing the --- front matter block");
  const fields = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`front matter line without a key: ${line}`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields[key] = LIST_FIELDS.includes(key) ? splitList(value) : value;
  }
  for (const key of LIST_FIELDS) fields[key] ??= [];
  return { fields, body: match[2].replace(/^\n+/, "").replace(/\s+$/, "") };
}

/** The file text for `task`; LF line endings, one trailing newline. Empty optional fields are left out. */
export function formatTask({ fields, body }) {
  const keys = [...FIELDS, ...Object.keys(fields).filter((key) => !FIELDS.includes(key))];
  const lines = keys
    .filter((key) => fields[key] !== undefined)
    .map((key) => [key, Array.isArray(fields[key]) ? fields[key].join(", ") : String(fields[key])])
    .filter(([key, value]) => value !== "" || ALWAYS_WRITTEN.includes(key))
    .map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n${body ? `\n${body}\n` : ""}`;
}

/** The section a heading stands for (结论（..） is 结论), or null when it is not one of BODY_SECTIONS. */
export function sectionName(heading) {
  return BODY_SECTIONS.find((section) => heading === section || heading.startsWith(`${section}（`)) ?? null;
}

/** The body as `{ before, sections: [{ heading, name, text }] }`; `before` is text above the first heading. */
export function splitBody(body) {
  const parts = body.split(/^## /m);
  const before = parts.shift().trim();
  const sections = parts.map((part) => {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    const text = newline === -1 ? "" : part.slice(newline + 1).trim();
    return { heading, name: sectionName(heading), text };
  });
  return { before, sections };
}

export function joinBody({ before, sections }) {
  return [before, ...sections.map(({ heading, text }) => `## ${heading}${text ? `\n\n${text}` : ""}`)]
    .filter(Boolean).join("\n\n");
}

/** The text of section `name`, or "" when the body has none. */
export function sectionText(body, name) {
  return splitBody(body).sections.find((section) => section.name === name)?.text ?? "";
}

/** The `- ` lines of section `name`, without the dash. */
export function sectionItems(body, name) {
  return sectionText(body, name).split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
}

/** `body` with `- line` added to section `name`, which is created in template order when missing. */
export function addLine(body, name, line) {
  const parsed = splitBody(body);
  const existing = parsed.sections.find((section) => section.name === name);
  if (existing) {
    existing.text = `${existing.text ? `${existing.text}\n` : ""}- ${line}`;
    return joinBody(parsed);
  }
  const rank = BODY_SECTIONS.indexOf(name);
  const index = parsed.sections.findIndex((section) => section.name !== null && BODY_SECTIONS.indexOf(section.name) > rank);
  const created = { heading: name, name, text: `- ${line}` };
  if (index === -1) parsed.sections.push(created);
  else parsed.sections.splice(index, 0, created);
  return joinBody(parsed);
}

/** `body` with `line` added under the handoff section. */
export function addHandoff(body, line) {
  return addLine(body, "交接", line);
}

/** The claim fields for `owner` in `lane`, keeping everything else. */
export function claimed(task, { owner, lane, at, scope }) {
  return {
    ...task,
    fields: { ...task.fields, status: "进行中", owner, lane: String(lane ?? ""), claimed: at, scope: scope ?? task.fields.scope },
  };
}

/** `task` without its claim (owner, lane, claim time), at `status`. */
export function unclaimed(task, status) {
  const { owner: _owner, lane: _lane, claimed: _claimed, ...fields } = task.fields;
  return { ...task, fields: { ...fields, status } };
}

/** Whose the task is: "free", "mine" (same lane), or "theirs". */
export function claimState({ fields }, lane) {
  if (fields.status !== "进行中" || !fields.owner) return "free";
  return fields.lane && String(lane) === fields.lane ? "mine" : "theirs";
}

export function compareIds(a, b) {
  return a.localeCompare(b, "en", { numeric: true });
}

/** Paths that both scopes cover: a scope entry is a file or a folder ending in "/". */
export function scopeOverlap(a, b) {
  const covers = (outer, inner) => outer === inner || (outer.endsWith("/") && inner.startsWith(outer));
  return a.filter((x) => b.some((y) => covers(x, y) || covers(y, x)));
}

/** Changed files that fall inside `scope`. */
export function filesInScope(files, scope) {
  return files.filter((file) => scope.some((entry) => entry === file || (entry.endsWith("/") && file.startsWith(entry))));
}
