// The GitHub Issues example plugin (plugins/examples/dev.focusd.github-issues) under the
// mock host, against a local stand-in for the GitHub API (FOCUSD_GITHUB_API).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { startMockHost } from "../../packages/fly-island-plugin/src/test/index.mjs";

const PLUGIN = path.resolve("plugins/examples/dev.focusd.github-issues");

function issue(number, extra = {}) {
  return { number, title: `Issue ${number}`, user: { login: "someone" }, updated_at: "2026-11-09T01:00:00Z", comments: 2, html_url: `https://github.com/a/one/issues/${number}`, ...extra };
}

/** A local GitHub: a/one has an issue and a pull request, anything else is 404; one device flow, slowed down once. */
async function fakeGitHub() {
  const seen = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const signedIn = request.headers.authorization === "Bearer ghu_test";
      seen.push({ method: request.method, url: request.url, signedIn, body, at: Date.now() });
      const limit = signedIn ? 5000 : 60;
      const send = (status, value) => {
        response.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(limit - 3),
          "X-RateLimit-Reset": "1900000000",
          ETag: '"one"',
        });
        response.end(JSON.stringify(value));
      };
      if (request.url.startsWith("/repos/a/one/issues")) send(200, [issue(1), issue(2, { pull_request: {} })]);
      else if (request.url.startsWith("/repos/")) send(404, { message: "Not Found" });
      else if (request.url === "/login/device/code") send(200, { device_code: "dc", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
      // The first poll is told to slow down to 6 s, as GitHub does to a poll that comes too soon.
      else if (request.url === "/login/oauth/access_token") send(200, seen.filter((call) => call.url === request.url).length === 1 ? { error: "slow_down", interval: 6 } : { access_token: "ghu_test", token_type: "bearer" });
      else if (request.url === "/user" && signedIn) send(200, { login: "tester" });
      else send(401, { message: "Bad credentials" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.FOCUSD_GITHUB_API = `http://127.0.0.1:${server.address().port}`;
  return { seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

const english = (text) => (typeof text === "string" ? text : text?.en ?? "");
const group = (model, start) => model.groups.find((g) => english(g.title).startsWith(start));
const account = (model) => model.groups[0].items[0];

test("each repository gets its own group, and one that fails does not take the others down", async () => {
  const github = await fakeGitHub();
  const host = startMockHost(PLUGIN, { settings: { repo: "a/one, a/missing, not a repo" }, timeoutMs: 30000 });
  try {
    host.viewVisible("issues");
    const model = await host.waitForView("issues", (m) => !m.loading && Boolean(group(m, "a/one - ")));
    assert.deepEqual(group(model, "a/one - 1 open").items.map((item) => item.id), ["a/one:1"], "pull requests are left out; ids carry the repository");
    assert.match(english(group(model, "a/missing").items[0].title), /not found/i);
    assert.deepEqual(group(model, "Not repository").items.map((item) => item.title), ["not", "a", "repo"]);
    assert.match(english(account(model).title), /Anonymous - 57\/60/);
    assert.equal(account(model).actions, undefined, "no sign-in button while the setting is off");
    assert.ok(github.seen.every((call) => !call.signedIn));
  } finally {
    await host.stop();
    await github.close();
  }
});

test("signing in asks for secrets, keeps the token there and uses it; signing out deletes it", async () => {
  const github = await fakeGitHub();
  const host = startMockHost(PLUGIN, { settings: { repo: "a/one", login: true, clientId: "Iv1.test" }, timeoutMs: 40000 });
  try {
    host.viewVisible("issues");
    let model = await host.waitForView("issues", (m) => !m.loading && Boolean(group(m, "a/one - ")));
    assert.deepEqual(account(model).actions.map((action) => action.id), ["login"]);
    host.viewAction("issues", "login");
    model = await host.waitForView("issues", (m) => m.groups[0].items[0].id === "login-code");
    assert.match(english(account(model).title), /ABCD-1234/);
    assert.ok(host.requests.some((call) => call.method === "permissions.request"));
    model = await host.waitForView("issues", (m) => /tester/.test(english(account(m).title)));
    assert.match(english(account(model).title), /Signed in as @tester - 4997\/5000/);
    assert.equal(JSON.parse(host.secrets.get("github.token")).token, "ghu_test");
    const polls = github.seen.filter((call) => call.url === "/login/oauth/access_token");
    assert.equal(polls.length, 2, "after slow_down the plugin waits and gets the token on the next poll");
    assert.ok(polls[1].at - polls[0].at >= 6000, "the next poll waits the interval GitHub asked for");
    assert.ok(github.seen.some((call) => call.url.startsWith("/repos/a/one") && call.signedIn), "issues are read with the token");
    assert.match(github.seen.find((call) => call.url === "/login/device/code").body, /client_id=Iv1\.test/);
    host.viewAction("issues", "logout");
    model = await host.waitForView("issues", (m) => /Anonymous/.test(english(account(m).title)));
    assert.equal(host.secrets.has("github.token"), false);
  } finally {
    await host.stop();
    await github.close();
  }
});

test("without a Client ID setting the sign-in uses the plugin's own GitHub App", async () => {
  const github = await fakeGitHub();
  const host = startMockHost(PLUGIN, { settings: { repo: "a/one", login: true }, timeoutMs: 30000 });
  try {
    host.viewVisible("issues");
    await host.waitForView("issues", (m) => !m.loading && Boolean(group(m, "a/one - ")));
    host.command("login");
    await host.waitForView("issues", (m) => m.groups[0].items[0].id === "login-code");
    assert.match(github.seen.find((call) => call.url === "/login/device/code").body, /client_id=Iv23liVdmttEzBHuhzg5/);
    host.viewAction("issues", "cancel");
    await host.waitForView("issues", (m) => m.groups[0].items[0].id === "account");
  } finally {
    await host.stop();
    await github.close();
  }
});
