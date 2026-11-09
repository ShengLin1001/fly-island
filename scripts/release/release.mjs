// Builds, signs and publishes a release that in-app updates can pick up.
//
// Usage:
//   pnpm release [--base-url <url>] [--no-upload] [--no-issue-comments]
//
// Set the version and start the notes first with `pnpm release:version <version>`.
//
// Explicit CI environment (otherwise the Windows local signing config is used):
//   TAURI_SIGNING_PRIVATE_KEY           private key content (or its path)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  empty string when the key has no password
//   TAURI_UPDATER_PUBKEY                public key content, must match the private key
//
// The script refuses to run when the four version fields disagree (versions.mjs),
// when the release notes file is missing or still a draft, or when the working
// tree has uncommitted changes. Published versions are never overwritten.
// Once public, it reads both channels back and tells the GitHub issues whose
// tasks shipped (after-release.mjs; --no-issue-comments skips that).
//
// A pre-release version (0.3.1-beta.1) is published as a GitHub pre-release,
// so the stable channel (GitHub's "latest" release) never offers it. Every
// release also refreshes the beta channel's manifest; see channel.mjs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { channelProblems, readTasks, RELEASED_MARKER, releasedComment, shippedIssues } from "./after-release.mjs";
import { commandLine } from "./command-line.mjs";
import { BETA_CHANNEL_TAG, isPrerelease, shouldUpdateBetaManifest } from "./channel.mjs";
import { baseTag, DRAFT_MARKER } from "./notes-draft.mjs";
import { readVersion, VERSION_FILES } from "./versions.mjs";
import { msiNames, msiVersion } from "./msi-version.mjs";
import { loadSigningEnvironment } from "./release-signing.mjs";

const CONFIG = "src-tauri/tauri.conf.json";
const OVERLAY = "src-tauri/tauri.release.conf.json";
const BUNDLE_DIR = "src-tauri/target/release/bundle/nsis";
const MSI_DIR = "src-tauri/target/release/bundle/msi";
const MSI_OVERLAY = "src-tauri/target/release/msi-version.conf.json";
const BETA_CHANNEL_DIR = "src-tauri/target/release/beta-channel";
const CHECK_DIR = "src-tauri/target/release/channel-check";
const REPO = "TixXin/fly-island";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base-url");
const baseUrl = baseFlag >= 0 ? args[baseFlag + 1] : "";
const upload = !args.includes("--no-upload");
const issueComments = !args.includes("--no-issue-comments");

if (baseFlag >= 0 && (!baseUrl || !URL.canParse(baseUrl) || new URL(baseUrl).protocol !== "https:")) {
  fail("--base-url requires a valid HTTPS URL.");
}
try {
  Object.assign(process.env, loadSigningEnvironment());
} catch (error) {
  fail(error.message);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  // On Windows the shell finds pnpm.cmd; it gets one quoted command line, since
  // passing an argument list together with `shell` is deprecated (DEP0190).
  const windows = process.platform === "win32";
  const result = spawnSync(windows ? commandLine(command, commandArgs) : command, windows ? [] : commandArgs, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: windows,
    windowsHide: true,
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

const versions = Object.entries(VERSION_FILES).map(([kind, path]) => [path, readVersion(kind, readFileSync(path, "utf8"))]);
const version = versions.find(([path]) => path === CONFIG)[1];
if (!version || versions.some(([, found]) => found !== version)) {
  fail(
    `Version mismatch: ${versions.map(([path, found]) => `${path}=${found}`).join(", ")}.\n` +
      "Set them together with pnpm release:version <version>.",
  );
}

const tag = `v${version}`;
const notesFile = `docs/releases/${tag}.md`;
if (!existsSync(notesFile)) fail(`Missing release notes: ${notesFile}`);
if (readFileSync(notesFile, "utf8").includes(DRAFT_MARKER)) {
  fail(`${notesFile} is still the draft pnpm release:version wrote: rewrite it for users and delete the draft marker.`);
}

if (!process.env.TAURI_UPDATER_PUBKEY?.trim()) {
  fail("TAURI_UPDATER_PUBKEY is not set; the built app would reject every update.");
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  fail("TAURI_SIGNING_PRIVATE_KEY is not set; cannot sign the updater artifacts.");
}
if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. Use an empty string for keys without a password,\n" +
      'otherwise the build waits for interactive input: $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""',
  );
}

if (upload) {
  const dirty = run("git", ["status", "--porcelain"], { capture: true }).stdout;
  if (dirty.trim()) fail(`Working tree has uncommitted changes:\n${dirty}`);
  const auth = run("gh", ["auth", "status"], { capture: true, allowFailure: true });
  if (auth.status !== 0) fail("gh is not authenticated. Run `gh auth login` first.");
  const existing = run("gh", ["release", "view", tag, "--repo", REPO], { capture: true, allowFailure: true });
  if (existing.status === 0) fail(`Release ${tag} already exists. Bump the version instead of replacing published update packages.`);
}

run("node", ["scripts/release/prepare-release-config.mjs"]);
const configs = ["--config", OVERLAY];
let wixVersion;
try {
  wixVersion = msiVersion(version);
} catch (error) {
  fail(error.message);
}
if (wixVersion) {
  // A pre-release (0.3.1-beta.1) needs a numeric MSI version; see msi-version.mjs.
  mkdirSync(dirname(MSI_OVERLAY), { recursive: true });
  writeFileSync(MSI_OVERLAY, `${JSON.stringify({ bundle: { windows: { wix: { version: wixVersion } } } })}\n`);
  configs.push("--config", MSI_OVERLAY);
  console.log(`MSI version for ${version}: ${wixVersion}`);
}
run("pnpm", ["tauri", "build", "--ci", ...configs, "--bundles", "nsis,msi"]);

const latestArgs = ["scripts/release/make-latest-json.mjs", "--notes-file", notesFile];
if (baseUrl) latestArgs.push("--base-url", baseUrl);
run("node", latestArgs);

const installer = readdirSync(BUNDLE_DIR).find((name) => name.endsWith(`_${version}_x64-setup.exe`));
if (!installer) fail(`Missing installer in ${BUNDLE_DIR}.`);
const msi = readdirSync(MSI_DIR).find((name) => msiNames(version).some((suffix) => name.endsWith(suffix)));
if (!msi) fail(`Missing MSI installer in ${MSI_DIR}.`);
const installers = [`${BUNDLE_DIR}/${installer}`, `${MSI_DIR}/${msi}`];
const checksumPath = `${BUNDLE_DIR}/SHA256SUMS.txt`;
writeFileSync(checksumPath, installers.map((path) =>
  `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${path.split("/").pop()}`,
).join("\n") + "\n");

if (!upload) {
  console.log(`\n✓ Built v${version}. NSIS: ${BUNDLE_DIR}; MSI: ${MSI_DIR} (--no-upload).`);
  process.exit(0);
}

const assets = [...installers, ...installers.map((path) => `${path}.sig`), `${BUNDLE_DIR}/latest.json`, checksumPath];
const revision = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
const prerelease = isPrerelease(version);
run("gh", [
  "release", "create", tag, "--repo", REPO, "--target", revision, "--draft",
  ...(prerelease ? ["--prerelease"] : []),
  "--title", tag, "--notes-file", notesFile, ...assets,
]);
// An unpublished draft's tag may not exist yet, so fetch its assets by release ID.
const releaseId = run("gh", ["release", "view", tag, "--repo", REPO, "--json", "databaseId", "--jq", ".databaseId"], { capture: true }).stdout.trim();
const remote = JSON.parse(run("gh", ["api", `repos/${REPO}/releases/${releaseId}`], { capture: true }).stdout);
for (const path of assets) {
  const name = path.split("/").pop();
  const asset = remote.assets.find((entry) => entry.name === name);
  const digest = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  if (!asset || asset.state !== "uploaded" || asset.digest !== digest) {
    fail(`Uploaded asset verification failed for ${name}. The release remains a draft.`);
  }
}
run("gh", [
  "release", "edit", tag, "--repo", REPO, "--draft=false",
  ...(prerelease ? ["--prerelease", "--latest=false"] : ["--latest"]),
]);
console.log(`\n✓ Published ${tag}${prerelease ? " as a pre-release (beta channel only)" : ""}.`);

updateBetaChannel(revision);
verifyChannels();
if (issueComments) tellShippedIssues(revision);

function updateBetaChannel(target) {
  const dir = BETA_CHANNEL_DIR;
  mkdirSync(dir, { recursive: true });
  const exists = run("gh", ["release", "view", BETA_CHANNEL_TAG, "--repo", REPO], { capture: true, allowFailure: true });
  if (exists.status !== 0) {
    const notes = join(dir, "notes.md");
    writeFileSync(notes, "Update manifest of the beta channel, refreshed by every release. Do not delete.\n");
    // A pre-release, so it can never become GitHub's "latest" release.
    run("gh", [
      "release", "create", BETA_CHANNEL_TAG, "--repo", REPO, "--target", target,
      "--prerelease", "--latest=false", "--title", BETA_CHANNEL_TAG, "--notes-file", notes,
    ]);
  }
  const current = run("gh", [
    "release", "download", BETA_CHANNEL_TAG, "--repo", REPO, "--pattern", "latest.json", "--dir", dir, "--clobber",
  ], { capture: true, allowFailure: true });
  const currentVersion = current.status === 0
    ? JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")).version
    : null;
  if (!shouldUpdateBetaManifest(version, currentVersion)) {
    console.log(`Beta channel keeps v${currentVersion}, which is newer than ${tag}.`);
    return;
  }
  run("gh", ["release", "upload", BETA_CHANNEL_TAG, `${BUNDLE_DIR}/latest.json`, "--repo", REPO, "--clobber"]);
  console.log(`✓ Beta channel now offers ${tag}.`);
}

/** Reads both channels' latest.json back through gh; GitHub may take a few seconds to switch "latest". */
function verifyChannels() {
  const read = (name, tagArgs) => {
    const dir = join(CHECK_DIR, name);
    mkdirSync(dir, { recursive: true });
    const result = run("gh", ["release", "download", ...tagArgs, "--repo", REPO, "--pattern", "latest.json", "--dir", dir, "--clobber"], { capture: true, allowFailure: true });
    return result.status === 0 ? JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")).version : null;
  };
  let problems = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    problems = channelProblems(version, { stable: read("stable", []), beta: read("beta", [BETA_CHANNEL_TAG]) });
    if (problems.length === 0) break;
  }
  if (problems.length > 0) {
    fail(`${tag} is published, but the update channels are off:\n${problems.join("\n")}\nSee "撤回有问题的版本" in docs/updater.md.`);
  }
  console.log(`✓ Channels read back: stable offers ${prerelease ? "the last final release" : tag}, beta offers ${tag}.`);
}

/** Comments once on each GitHub issue whose task has a commit in this release. */
function tellShippedIssues(target) {
  run("git", ["fetch", "--quiet", "--tags", "origin"], { allowFailure: true });
  const tags = run("git", ["tag", "--list", "v*"], { capture: true }).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  const base = baseTag(version, tags);
  const log = run("git", ["log", "--no-merges", "--format=%H%x09%s", base ? `${base}..${target}` : target], { capture: true }).stdout;
  const commits = log.split("\n").filter(Boolean).map((line) => {
    const [hash, ...subject] = line.split("\t");
    return { hash, subject: subject.join("\t") };
  });
  const shipped = shippedIssues(readTasks(), commits);
  const url = `https://github.com/${REPO}/releases/tag/${tag}`;
  const dir = join(CHECK_DIR, "comments");
  mkdirSync(dir, { recursive: true });
  for (const [issue, tasks] of shipped) {
    const existing = run("gh", ["api", `repos/${REPO}/issues/${issue}/comments`, "--paginate", "--jq", ".[].body"], { capture: true, allowFailure: true });
    if (existing.status !== 0) {
      console.log(`  #${issue}: could not read its comments, so it was not told.`);
      continue;
    }
    if (existing.stdout.includes(RELEASED_MARKER(tag))) continue;
    const body = join(dir, `${issue}.md`);
    writeFileSync(body, releasedComment({ tag, url, tasks, repo: REPO }));
    const posted = run("gh", ["issue", "comment", String(issue), "--repo", REPO, "--body-file", body], { capture: true, allowFailure: true });
    console.log(posted.status === 0 ? `✓ Told #${issue} that it shipped in ${tag}.` : `  #${issue}: the comment failed: ${posted.stderr.trim()}`);
  }
  if (shipped.size === 0) console.log(`No GitHub issue has a task with a commit in ${tag}.`);
}
