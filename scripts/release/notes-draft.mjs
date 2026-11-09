// The first draft of docs/releases/v<version>.md that `pnpm release:version`
// writes: the opening and closing paragraphs every release has, and the
// feat/fix/perf commits since the release it follows, to be rewritten for users.
// The draft carries DRAFT_MARKER; release.mjs refuses to publish while it is there.
import { compareVersions, isPrerelease } from "./channel.mjs";
import { isVersion } from "./versions.mjs";

export const DRAFT_MARKER = "<!-- release-notes-draft -->";

/** Scopes whose commits never reach users: development tools and the release itself. */
const INTERNAL_SCOPES = new Set(["tooling", "release", "tasks", "docs", "ci"]);
const ZH_ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const EN_ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/**
 * The tag the notes count from: for a beta the newest earlier release of any
 * kind; for a final release the newest earlier final one, so its notes cover
 * its betas too. Null when there is none.
 */
export function baseTag(version, tags) {
  const earlier = tags
    .filter((tag) => isVersion(tag.replace(/^v/, "")))
    .filter((tag) => compareVersions(tag.replace(/^v/, ""), version) < 0)
    .filter((tag) => isPrerelease(version) || !isPrerelease(tag.replace(/^v/, "")))
    .sort((left, right) => compareVersions(left.replace(/^v/, ""), right.replace(/^v/, "")));
  return earlier.at(-1) ?? null;
}

/** Commits worth a line in the notes: feat, fix and perf outside the internal scopes. */
export function userFacingCommits(commits) {
  return commits.filter(({ subject }) => {
    const match = /^(feat|fix|perf)(?:\(([^)]+)\))?!?:/.exec(subject);
    return match && !INTERNAL_SCOPES.has(match[2] ?? "");
  });
}

function betaNumber(version) {
  const number = Number(/-beta\.(\d+)$/.exec(version)?.[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** The draft notes for `version`; `commits` are { hash, subject } since `base`. */
export function draftNotes(version, base, commits) {
  const core = version.replace(/-.*/, "");
  const beta = isPrerelease(version);
  const number = betaNumber(version);
  const zhWhich = number && number <= 10 ? `第${ZH_ORDINALS[number - 1]}个测试版` : "测试版";
  const enWhich = number && number <= 10 ? `the ${EN_ORDINALS[number - 1]} beta` : "a beta";
  const zhAbout = beta
    ? `这是 ${core} 的${zhWhich}，只推送给在 设置 → 关于 → 版本 里选择了「测试版」通道的用户，以及到 Release 页面手动下载安装的用户；稳定版用户不会收到。选测试版的用户正式版本发布时也照常收到；切回稳定版不会降级。直接覆盖安装即可，待办、笔记、设置和已连接的邮箱都会保留。`
    : `${version} 正式版${base ? `，包含 ${base} 以来的全部改动` : ""}。直接覆盖安装即可，待办、笔记、设置和已连接的邮箱都会保留。安装包没有代码签名，Windows SmartScreen 提示"未知发布者"时，点「更多信息 → 仍要运行」。`;
  const enAbout = beta
    ? `This is ${enWhich} of ${core}. It reaches only users who chose the Beta channel under Settings → About → Version, or who install it by hand from the Releases page; users on the stable channel are not offered it. Beta users still get every final release, and switching back to Stable never downgrades. Install over your current version. Todos, notes, settings and connected mailboxes are kept.`
    : `The ${version} release${base ? `, with everything since ${base}` : ""}. Install over your current version. Todos, notes, settings and connected mailboxes are kept. The installers are not code-signed; if Windows SmartScreen says "Unknown publisher", choose "More info → Run anyway".`;
  const listed = userFacingCommits(commits);
  const changes = listed.length > 0 ? listed.map(({ hash, subject }) => `- ${hash} ${subject}`).join("\n") : "- (no feat/fix/perf commits found)";
  return `${DRAFT_MARKER}
<!-- Rewrite the commits below into lines for users in both languages, then delete this
comment, the marker above and the commit list. pnpm release refuses to publish while the
marker is here. Commits since ${base ?? "the first commit"}: -->
<!--
${changes}
-->

## 关于这个版本

${zhAbout}

## 更新内容

-

---

## About this release

${enAbout}

## What's New

-

## Downloads

- \`fly-island_${version}_x64-setup.exe\`: Windows x64 EXE installer.
- \`*.msi\`: Windows x64 MSI installer${beta ? " (its internal MSI version is numeric, because MSI versions must be)" : ""}.
- \`SHA256SUMS.txt\`: SHA-256 checksums for both installers.
`;
}
