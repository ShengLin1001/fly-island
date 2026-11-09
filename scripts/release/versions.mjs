// The app's version lives in four files that must agree: package.json,
// src-tauri/tauri.conf.json, src-tauri/Cargo.toml and the app's own entry in
// src-tauri/Cargo.lock. `pnpm release:version` sets them (bump.mjs); release.mjs
// checks them. The edits change only the version text, so formatting stays.
import { compareVersions } from "./channel.mjs";

export const VERSION_FILES = {
  package: "package.json",
  tauri: "src-tauri/tauri.conf.json",
  cargo: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

/** The crate whose entry in Cargo.lock carries the app version. */
const CRATE = "focusd-island";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const PATTERNS = {
  // The first "version" key is the top-level one in both JSON files.
  package: /("version"\s*:\s*")([^"]+)(")/,
  tauri: /("version"\s*:\s*")([^"]+)(")/,
  // The first version line is [package]'s.
  cargo: /^(version\s*=\s*")([^"]+)(")/m,
  cargoLock: new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${CRATE}"\\r?\\nversion = ")([^"]+)(")`),
};

/** The version written in one of the files' text, or null. */
export function readVersion(kind, text) {
  return PATTERNS[kind].exec(text)?.[2] ?? null;
}

/** The text with its version set to `version`; throws when the file has none. */
export function writeVersion(kind, text, version) {
  if (readVersion(kind, text) === null) throw new Error(`No version found in ${VERSION_FILES[kind]}.`);
  return text.replace(PATTERNS[kind], (_, before, _old, after) => `${before}${version}${after}`);
}

export function isVersion(version) {
  return SEMVER.test(version);
}

/** Why `version` cannot be the next release after the released `tags` (v-prefixed), or null when it can. */
export function bumpProblem(version, tags) {
  if (!isVersion(version)) return `${version} is not a version like 0.3.4 or 0.3.4-beta.1.`;
  const released = tags.map((tag) => tag.replace(/^v/, "")).filter(isVersion);
  const newest = released.sort(compareVersions).at(-1);
  if (newest && compareVersions(version, newest) <= 0) return `${version} is not newer than the last release, v${newest}.`;
  return null;
}
