// `pnpm tasks landing`, run by scripts/land-check.mjs on every land: a task marked 已完成
// in the landing must name commits that exist, and the lane's own claims that are still
// open get a reminder.
import path from "node:path";
import { claimState, groupOf, parseTask, sectionItems } from "./taskFile.mjs";
import { commitRef } from "./taskRules.mjs";
import { TASKS_DIR, readAll, taskPath, tryGit } from "./taskRepo.mjs";

function lines(text) {
  return (text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

/** The status task `id` had on origin/main, or null when it did not exist there. */
function statusOnMain(root, id) {
  // Earlier layouts (all 2026-11-09): docs/tasks/<id>.md and archive/<id>.md, then archive/<group>/<id>.md.
  const old = [`${TASKS_DIR}/${id}.md`, `${TASKS_DIR}/archive/${id}.md`, `${TASKS_DIR}/archive/${groupOf(id)}/${id}.md`];
  const paths = [taskPath(id, false), taskPath(id, true), ...old];
  for (const file of paths) {
    const text = tryGit(["show", `origin/main:${file}`], root);
    if (text !== null) {
      try {
        return parseTask(text).fields.status;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Problems with the tasks this landing marks 已完成. `facts` can be passed in by tests:
 * { changed: ids, landing: subjects, history: subjects, commitExists(hash) }.
 */
export function doneProblems(tasks, facts) {
  const problems = [];
  const subjects = new Set([...facts.landing, ...facts.history]);
  for (const task of tasks) {
    const { id, status } = task.fields;
    if (status !== "已完成" || !facts.changed.has(id) || facts.wasDone(id)) continue;
    const refs = sectionItems(task.body, "提交").map(commitRef).filter(Boolean);
    if (refs.length === 0) {
      problems.push(`${id} 标成了已完成，但 ## 提交 里没有提交标题（\`feat(..): ..\`）或提交号`);
      continue;
    }
    for (const ref of refs) {
      if (ref.subject && !subjects.has(ref.subject)) problems.push(`${id} 的提交「${ref.subject}」既不在这次 land 里，也不在 main 上；提交标题要一字不差`);
      if (ref.hash && !facts.commitExists(ref.hash)) problems.push(`${id} 的提交号 ${ref.hash} 不存在`);
    }
  }
  return problems;
}

export function landingProblems(root) {
  const changedFiles = lines(tryGit(["diff", "--name-only", "origin/main...HEAD", "--", TASKS_DIR], root));
  if (changedFiles.length === 0) return [];
  const changed = new Set(changedFiles.map((file) => path.basename(file, ".md")));
  return doneProblems(readAll(root), {
    changed,
    landing: lines(tryGit(["log", "--format=%s", "origin/main..HEAD"], root)),
    history: lines(tryGit(["log", "--format=%s", "origin/main"], root)),
    commitExists: (hash) => tryGit(["cat-file", "-e", `${hash}^{commit}`], root) !== null,
    wasDone: (id) => statusOnMain(root, id) === "已完成",
  });
}

/** Reminders for this lane's claims that are still open while it lands other work. */
export function laneReminders(root, lane) {
  if (lane === null) return [];
  const changed = lines(tryGit(["diff", "--name-only", "origin/main...HEAD"], root));
  if (!changed.some((file) => !file.startsWith(`${TASKS_DIR}/`))) return [];
  return readAll(root)
    .filter((task) => claimState(task, lane) === "mine")
    .map((task) => `lane ${lane} 认领的 ${task.fields.id} 还是进行中：做完了用 pnpm tasks done ${task.fields.id}，没做完用 pnpm tasks note ${task.fields.id} 留交接`);
}
