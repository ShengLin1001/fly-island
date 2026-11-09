// The system monitor example plugin (plugins/examples/dev.focusd.system-monitor) under the mock
// host: with background recording on it reads while the page is closed and hands the page those
// five minutes when it opens; it is off by default.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startMockHost } from "../../packages/fly-island-plugin/src/test/index.mjs";

const PLUGIN = path.resolve("plugins/examples/dev.focusd.system-monitor");
const windowsOnly = { skip: process.platform !== "win32" };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens the page as the island does: visible, then the page's "ready". */
function openPage(host) {
  host.viewVisible("monitor", true);
  host.webviewMessage("monitor", { type: "ready" });
}

test("background recording keeps the plugin running and gives the opening page what it recorded", windowsOnly, async () => {
  const host = startMockHost(PLUGIN, { settings: { backgroundHistory: true }, timeoutMs: 60000 });
  try {
    await host.waitFor((h) => h.keepAlive);
    // Performance counters take a few seconds to open (10 s and more on a busy machine), then one reading a second.
    await delay(12000);
    assert.equal(host.webviewMessages.length, 0, "nothing goes to a closed page");
    openPage(host);
    const history = (await host.waitFor((h) => h.webviewMessages[0])).message;
    assert.equal(history.type, "history");
    for (const key of ["cpu", "gpu", "down", "up"]) {
      assert.ok(Array.isArray(history[key]) && history[key].length >= 1, `${key}: ${JSON.stringify(history[key])}`);
    }
    assert.equal((await host.waitFor((h) => h.webviewMessages[1])).message.type, "sample");
  } finally {
    await host.stop();
  }
});

test("background recording is off by default, so the plugin can stop when idle", windowsOnly, async () => {
  const host = startMockHost(PLUGIN, { timeoutMs: 60000 });
  try {
    assert.equal(host.settings.backgroundHistory, false);
    assert.equal((await host.waitForRequest("host.keepAlive")).params.reason, null);
  } finally {
    await host.stop();
  }
});
