// Task files on disk: open ones in docs/tasks/, closed ones in docs/tasks/archive/,
// the group table in docs/tasks/README.md; and whether a claim still holds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CLOSED_STATUSES, formatTask, parseTask } from "./taskFile.mjs";
import { checkEntries, parseGroups } from "./taskRules.mjs";

export const TASKS_DIR = "docs/tasks";
export const ARCHIVE_DIR = "docs/tasks/archive";
const README = "docs/tasks/README.md";
const STALE_MS = 24 * 60 * 60 * 1000;

export function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

export function tryGit(args, cwd) {
  try {
    return git(args, { stdio: ["ignore", "pipe", "ignore"], ...(cwd ? { cwd } : {}) });
  } catch {
    return null;
  }
}

function readDir(dir, archived) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => {
      const file = path.join(dir, name);
      const id = name.slice(0, -3);
      try {
        return { file, id, archived, task: parseTask(readFileSync(file, "utf8")) };
      } catch (error) {
        return { file, id, archived, error: error.message };
      }
    });
}

/** Every task file as `{ file, id, archived, task?, error? }`; open ones first. */
export function readEntries(root) {
  return [...readDir(path.join(root, TASKS_DIR), false), ...readDir(path.join(root, ARCHIVE_DIR), true)];
}

/** Every task that parses. */
export function readAll(root) {
  return readEntries(root).filter((entry) => entry.task).map((entry) => entry.task);
}

export function readGroups(root) {
  const file = path.join(root, README);
  return existsSync(file) ? parseGroups(readFileSync(file, "utf8")) : [];
}

/** Every problem with the task files. */
export function checkTasks(root) {
  return checkEntries(readEntries(root), readGroups(root));
}

/** Where task `id` is now, or null. */
export function findTask(root, id) {
  for (const dir of [TASKS_DIR, ARCHIVE_DIR]) {
    const file = path.join(root, dir, `${id}.md`);
    if (existsSync(file)) return file;
  }
  return null;
}

export function load(root, id) {
  const file = findTask(root, id);
  if (!file) throw new Error(`没有任务 ${id}；新任务先用 pnpm tasks add`);
  return parseTask(readFileSync(file, "utf8"));
}

/** Writes `task` to the folder its status belongs in, moving it (with git when tracked) if it was in the other. */
export function save(root, task) {
  const dir = CLOSED_STATUSES.includes(task.fields.status) ? ARCHIVE_DIR : TASKS_DIR;
  const target = path.join(root, dir, `${task.fields.id}.md`);
  const current = findTask(root, task.fields.id);
  mkdirSync(path.dirname(target), { recursive: true });
  if (current && path.resolve(current) !== path.resolve(target)) {
    const relative = path.relative(root, current).replaceAll("\\", "/");
    if (tryGit(["-C", root, "ls-files", "--error-unmatch", relative]) !== null) {
      git(["-C", root, "mv", relative, path.relative(root, target).replaceAll("\\", "/")]);
    } else {
      renameSync(current, target);
    }
  }
  writeFileSync(target, formatTask(task));
  return path.relative(root, target).replaceAll("\\", "/");
}

/** Removes task `id`'s file (a task added by mistake); tracked files go through git rm. */
export function remove(root, id) {
  const file = findTask(root, id);
  if (!file) return;
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (tryGit(["-C", root, "rm", "-q", "-f", relative]) === null) unlinkSync(file);
}

export function nowText(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayText(date = new Date()) {
  return nowText(date).slice(0, 10);
}

function laneDir(main, lane) {
  return path.join(path.dirname(main), `${path.basename(main)}-lanes`, String(lane));
}

export function laneOwners(main) {
  try {
    return JSON.parse(readFileSync(path.join(main, ".git", "claude-code-merge-queue", "lane-owners.json"), "utf8"));
  } catch {
    return {};
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Why a claim no longer holds, or null: its lane is gone, the session that made the lane exited, or a day without moves. */
export function staleReason({ fields }, { laneExists, ownerPidAlive, lastLaneCommitMs, now = Date.now() }) {
  if (fields.status !== "进行中" || !fields.lane) return null;
  if (!laneExists) return `lane ${fields.lane} 已不存在`;
  if (ownerPidAlive === false) return `建 lane ${fields.lane} 的会话已退出`;
  const claimedAt = Date.parse(fields.claimed?.replace(" ", "T") ?? "");
  const quietSince = Math.max(Number.isNaN(claimedAt) ? 0 : claimedAt, lastLaneCommitMs ?? 0);
  if (quietSince && now - quietSince > STALE_MS) return `lane ${fields.lane} 超过 24 小时没有提交`;
  return null;
}

function laneFacts(main, lane) {
  const dir = laneDir(main, lane);
  const owner = laneOwners(main)[path.resolve(dir).toLowerCase()];
  const last = existsSync(dir) ? tryGit(["-C", dir, "log", "-1", "--format=%ct"]) : null;
  return { laneExists: existsSync(dir), ownerPidAlive: owner ? alive(owner.pid) : null, lastLaneCommitMs: last ? Number(last) * 1000 : null };
}

/** `staleReason` for `task` against the lanes next to the main checkout `main`. */
export function staleOf(main, task) {
  return task.fields.lane ? staleReason(task, laneFacts(main, task.fields.lane)) : null;
}
