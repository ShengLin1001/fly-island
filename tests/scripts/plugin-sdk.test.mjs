import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generatedFiles } from "../../scripts/plugins/build-plugin-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8").replaceAll("\r\n", "\n");

test("the generated SDK files match their sources (run pnpm sdk:build)", () => {
  for (const [relative, expected] of generatedFiles(root)) {
    assert.equal(read(relative), expected, relative);
  }
});

test("the PowerShell module exports every function and stays ASCII", () => {
  const module = read("packages/powershell/FlyIsland.Plugin/FlyIsland.Plugin.psm1");
  const manifest = read("packages/powershell/FlyIsland.Plugin/FlyIsland.Plugin.psd1");
  const functions = [...module.matchAll(/^function ([\w-]+)/gm)].map((match) => match[1]).sort();
  const exported = [...manifest.matchAll(/'([A-Za-z]+-Focusd\w*)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(exported, functions);
  assert.ok([...module].every((char) => char.charCodeAt(0) < 128), "FlyIsland.Plugin.psm1 must be ASCII for PowerShell 5.1");
  assert.ok([...read("plugins/sdk/powershell/focusd.ps1")].every((char) => char.charCodeAt(0) < 128));
});

// Windows PowerShell 5.1's [Console]::In.ReadLineAsync blocked until a line came, so waits never
// timed out and timer-driven plugins (the system monitor) stalled between messages (E10).
test("the PowerShell SDK's wait for a message times out, and reads UTF-8", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "focusd-sdk-"));
  try {
    copyFileSync(path.join(root, "plugins/sdk/powershell/focusd.ps1"), path.join(dir, "focusd.ps1"));
    writeFileSync(path.join(dir, "main.ps1"), [
      '. "$PSScriptRoot\\focusd.ps1"',
      "foreach ($i in 1..3) { if ($null -eq (Receive-FocusdNotification 200)) { Write-FocusdLog 'timeout' } }",
      "$message = Receive-FocusdNotification 10000",
      "Write-FocusdLog \"echo $($message.params.text)\"",
    ].join("\r\n"));
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(dir, "main.ps1")], { stdio: ["pipe", "pipe", "inherit"] });
    const logs = [];
    let timeouts = 0;
    const finished = new Promise((resolve) => child.on("exit", resolve));
    child.stdout.setEncoding("utf8");
    let buffered = "";
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      let end;
      while ((end = buffered.indexOf("\n")) >= 0) {
        const message = JSON.parse(buffered.slice(0, end));
        buffered = buffered.slice(end + 1);
        logs.push(message.params.message);
        // Answer only once all three waits have timed out on their own.
        if (message.params.message === "timeout" && ++timeouts === 3) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "echo", params: { text: "番茄钟 ☕" } })}\n`);
        }
      }
    });
    const timer = setTimeout(() => child.kill(), 20_000);
    await finished;
    clearTimeout(timer);
    assert.deepEqual(logs, ["timeout", "timeout", "timeout", "echo 番茄钟 ☕"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the npm packages publish what they reference", () => {
  for (const name of ["fly-island-plugin", "create-fly-island-plugin"]) {
    const pkg = JSON.parse(read(`packages/${name}/package.json`));
    for (const target of Object.values(pkg.bin)) assert.ok(pkg.files.includes(target.split("/")[0]), `${name}: ${target}`);
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], `${name} has no runtime dependencies`);
  }
  const versions = ["fly-island-plugin", "create-fly-island-plugin"].map((name) => JSON.parse(read(`packages/${name}/package.json`)).version);
  assert.equal(versions[0], versions[1], "create-fly-island-plugin makes plugins depend on its own version of fly-island-plugin");
});
