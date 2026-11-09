// Sets the app version for the next release and starts its notes.
//
// Usage:
//   pnpm release:version <version>      e.g. 0.3.4 or 0.3.4-beta.1
//
// Writes the version into package.json, src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml and the app's entry in src-tauri/Cargo.lock (versions.mjs),
// after checking it is newer than every released tag. When
// docs/releases/v<version>.md does not exist yet, writes a draft with the
// paragraphs every release has and the user-facing commits since the release it
// follows (notes-draft.mjs). Commit both, land them, then run `pnpm release`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { baseTag, draftNotes } from "./notes-draft.mjs";
import { bumpProblem, VERSION_FILES, writeVersion } from "./versions.mjs";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

const version = process.argv[2]?.replace(/^v/, "");
if (!version) fail("Usage: pnpm release:version <version>, e.g. 0.3.4 or 0.3.4-beta.1");

git(["fetch", "--quiet", "--tags", "origin"]);
const tags = git(["tag", "--list", "v*"]).split("\n").map((tag) => tag.trim()).filter(Boolean);
const problem = bumpProblem(version, tags);
if (problem) fail(problem);

for (const [kind, path] of Object.entries(VERSION_FILES)) {
  try {
    writeFileSync(path, writeVersion(kind, readFileSync(path, "utf8"), version));
  } catch (error) {
    fail(error.message);
  }
  console.log(`✓ ${path} → ${version}`);
}

const notes = `docs/releases/v${version}.md`;
if (existsSync(notes)) {
  console.log(`  ${notes} exists; left as it is.`);
} else {
  const base = baseTag(version, tags);
  const range = base ? `${base}..HEAD` : "HEAD";
  const commits = git(["log", "--no-merges", "--format=%h%x09%s", range])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subject] = line.split("\t");
      return { hash, subject: subject.join("\t") };
    });
  writeFileSync(notes, draftNotes(version, base, commits));
  console.log(`✓ ${notes}: a draft with ${commits.length} commits since ${base ?? "the first commit"} to rewrite for users.`);
}
console.log("\nNext: rewrite the notes, commit, land, then run `pnpm release` from the same lane.");
