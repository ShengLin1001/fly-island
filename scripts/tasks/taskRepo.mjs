// Task files on disk: open ones in docs/tasks/<group>/, closed ones in
// docs/tasks/0-archive/<group>/ (the group is the id's first letter), the group table in
// docs/tasks/README.md; and whether a claim still holds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CLOSED_STATUSES, formatTask, groupOf, parseTask } from "./taskFile.mjs";
import { checkEntries, parseGroups } from "./taskRules.mjs";

export const TASKS_DIR = "docs/tasks";
export const ARCHIVE_DIR = "docs/tasks/0-archive";
const README = "docs/tasks/README.md";

/** Where task `id` belongs, relative to the repo: docs/tasks/F/F15.md, or under 0-archive/ once closed. */
export function taskPath(id, closed) {
  return `${closed ? ARCHIVE_DIR : TASKS_DIR}/${groupOf(id)}/${id}.md`;
}
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

function readFiles(root, dir, archived, folder) {
  const full = path.join(root, dir);
  return readdirSync(full)
    .filter((name) => name.endsWith(".md") && !(folder === "" && name === "README.md"))
    .map((name) => {
      const file = `${dir}/${name}`;
      const id = name.slice(0, -3);
      try {
        return { file, id, archived, folder, task: parseTask(readFileSync(path.join(root, file), "utf8")) };
      } catch (error) {
        return { file, id, archived, folder, error: error.message };
      }
    });
}

/** Task files in `dir` and its group folders; files directly in `dir` come back with folder "" (check flags them). */
function readDir(root, dir, archived) {
  if (!existsSync(path.join(root, dir))) return [];
  const folders = readdirSync(path.join(root, dir))
    .filter((name) => name !== path.basename(ARCHIVE_DIR) && statSync(path.join(root, dir, name)).isDirectory());
  return [readFiles(root, dir, archived, ""), ...folders.map((folder) => readFiles(root, `${dir}/${folder}`, archived, folder))].flat();
}

/** Every task file as `{ file, id, archived, folder, task?, error? }` (file relative to the repo); open ones first. */
export function readEntries(root) {
  return [...readDir(root, TASKS_DIR, false), ...readDir(root, ARCHIVE_DIR, true)];
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

/** Where task `id` is now (absolute), or null. */
export function findTask(root, id) {
  for (const closed of [false, true]) {
    const file = path.join(root, taskPath(id, closed));
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
  const target = path.join(root, taskPath(task.fields.id, CLOSED_STATUSES.includes(task.fields.status)));
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
