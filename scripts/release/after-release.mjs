// What pnpm release does once a release is public:
// - reads both update channels' latest.json back through gh (curl to the
//   download URL sometimes gets a 504 from GitHub's CDN) and fails loudly when
//   one does not offer what it should;
// - tells each GitHub issue whose task shipped in this release that it is out.
//   Tasks link issues with `issue: <n>` and list their commits under "## 提交"
//   (docs/tasks/README.md); a task shipped when one of those commits is in the
//   release's range. Each issue is told once per release (a marker in the comment).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPrerelease } from "./channel.mjs";

export const RELEASED_MARKER = (tag) => `<!-- released: ${tag} -->`;

/** Problems with the channels after releasing `version`; empty when both are right. */
export function channelProblems(version, { stable, beta }) {
  const problems = [];
  if (isPrerelease(version)) {
    if (stable === version) problems.push(`The stable channel offers the beta ${version}.`);
  } else if (stable !== version) {
    problems.push(`The stable channel offers ${stable ?? "nothing"}, not ${version}.`);
  }
  if (beta !== version) problems.push(`The beta channel offers ${beta ?? "nothing"}, not ${version}.`);
  return problems;
}

/** A task file's id, issue number and listed commits (subjects in backticks, or hashes). */
export function parseTask(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(front)?.[1].trim() ?? null;
  const section = /^## 提交\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const commits = section
    .split(/\r?\n/)
    .map((line) => /^-\s+(?:`([^`]+)`|([0-9a-f]{7,40})\b)/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => match[1] ?? match[2]);
  const issue = Number(field("issue"));
  return { id: field("id"), issue: Number.isInteger(issue) && issue > 0 ? issue : null, commits };
}

/**
 * The issues whose tasks have a commit among `commits` ({ hash: full hash, subject }),
 * each with those tasks. A task lists a commit by its subject or by a hash prefix.
 */
export function shippedIssues(tasks, commits) {
  const subjects = new Set(commits.map(({ subject }) => subject));
  const isHash = (entry) => /^[0-9a-f]{7,40}$/.test(entry);
  const shipped = new Map();
  for (const task of tasks) {
    if (!task.issue) continue;
    const hit = task.commits.some((entry) => subjects.has(entry) || (isHash(entry) && commits.some(({ hash }) => hash.startsWith(entry))));
    if (hit) shipped.set(task.issue, [...(shipped.get(task.issue) ?? []), task]);
  }
  return shipped;
}

/** Every task file under docs/tasks, closed ones included. */
export function readTasks(root = "docs/tasks") {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".md") && name !== "README.md") files.push(path);
    }
  };
  walk(root);
  return files.map((path) => ({ path: path.replaceAll("\\", "/"), ...parseTask(readFileSync(path, "utf8")) }));
}

/** The comment telling an issue its change is out. */
export function releasedComment({ tag, url, tasks, repo }) {
  const beta = isPrerelease(tag.replace(/^v/, ""));
  const links = tasks.map(({ id, path }) => `[${id}](https://github.com/${repo}/blob/main/${path})`).join("、");
  return `## 已发布：${tag}

这个 issue 的修改已随 **${tag}**（${beta ? "测试版" : "正式版"}）发布：${url}

在 设置 → 关于 → 版本 里检查更新即可${beta ? "（要先把更新通道选成「测试版」）" : ""}，也可以到上面的 Release 页面下载安装。任务文档：${links}。

---
*本回复由 tixxin Agent Team 的发布脚本在发布后自动发送。*
${RELEASED_MARKER(tag)}
`;
}
