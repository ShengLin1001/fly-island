// pnpm dev, then open /tests/regression/claude-session-ring.html (demo) or ?test=1 (checks).
import { act, StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import { useCollapsedSlots } from "../../src/windows/island/useCollapsedSlots";
import type { CollapsedSlots } from "../../src/windows/island/types";
import type { ClaudeSessionsSnapshot } from "../../src/features/claude-sessions/api";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { useMail } from "../../src/features/messages/mail/MailPanel";
import type { MediaState } from "../../src/features/media/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const automated = new URLSearchParams(location.search).has("test");
// Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
const UNAVAILABLE_MEDIA: MediaState = {
  available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable",
  title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0,
  canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false,
  repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null,
  sessions: [], updatedAt: 0,
};
const keys = ["focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-mail-settings"];
const originals = keys.map((key) => localStorage.getItem(key));
keys.forEach((key) => localStorage.removeItem(key));
window.addEventListener("beforeunload", () => {
  keys.forEach((key, index) => originals[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, originals[index]!));
});

const counts = (needs: number, yourturn: number, working: number, done: number) =>
  ({ needs, yourturn, working, stale: 0, done, total: needs + yourturn + working + done });
const BUSY: ClaudeSessionsSnapshot = {
  detected: true, stateDir: "C:\\Users\\me\\.claude\\session-status\\state", sessions: [], counts: counts(1, 1, 2, 1),
};
const QUIET: ClaudeSessionsSnapshot = { ...BUSY, counts: counts(0, 0, 0, 0) };
// claude-sessions not installed: no state directory.
const MISSING: ClaudeSessionsSnapshot = { ...BUSY, detected: false };
// What the mocked host answers; each scenario sets these, then mounts a fresh island.
let pluginOn = true;
// null: the first read has not come back yet.
let sessions: ClaudeSessionsSnapshot | null = BUSY;
mockIPC((command) => {
  if (command === "get_qq_mail_state") return [{
    revision: 0, email: "", configured: false, enabled: false, syncing: false,
    status: "disabled", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
  }];
  if (command === "list_plugins") return {
    allowThirdParty: false, nodeAvailable: false, pluginsDir: "", autoUpdate: false, trustedPublishers: [],
    plugins: [{ id: "focusd.claude-sessions", builtin: true, enabled: pluginOn, status: "running", settings: {} }],
  };
  if (command === "get_claude_sessions") return sessions ?? new Promise(() => {});
}, { shouldMockEvents: true });

let openedPage: string | null = null;

function Island({ agents, count, report }: { agents: boolean; count: number; report: (slots: CollapsedSlots) => void }) {
  const slots = useCollapsedSlots({ paused: true, agents: [], agentsOn: agents, onOpenAgents: () => { openedPage = "agents"; } });
  report(slots);
  const qq = useQQNotifications(true);
  const wechat = useWeChatReminders(true);
  const qqMail = useMail(true);
  return <div className="stage" style={{ "--collapsed-island-width": "300px" } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={{ notification: null, dismiss: () => {}, runAction: () => {} }}
      mode="collapsed" page="todo" isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle="剩余3个待办" collapsedTodoCount={null} agentSession={null} activeAgentSessionCount={count}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: false, wechat: false, qqMail: false, agents, translation: false }}
      shelfCount={null} collapsedSlots={slots}
      onOpenPage={(page) => { openedPage = page; }} onOpenMessages={() => {}}
      onPageChange={() => {}} onWindowDragStart={() => {}} onCollapse={() => {}}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => {}} onReveal={() => {}} pageDigitModifiers="Alt">
      <span>待办清单</span>
    </IslandShell>
  </div>;
}

const fixtures = document.getElementById("fixtures")!;
const results = document.getElementById("results")!;
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

/** Mounts one island, captioned, with the mocks as set now; returns its collapsed bar and its slots. */
async function mount(caption: string, agents: boolean, count = 2) {
  let slots: CollapsedSlots = {};
  const box = document.createElement("div");
  box.className = "fixture";
  const label = document.createElement("div");
  label.className = "caption";
  label.textContent = caption;
  fixtures.append(box, label);
  await act(async () => {
    createRoot(box).render(<StrictMode><Island agents={agents} count={count} report={(next) => { slots = next; }} /></StrictMode>);
  });
  // Let the plugin list and the session read come back.
  for (let frame = 0; frame < 10; frame += 1) await act(async () => { await new Promise(requestAnimationFrame); });
  return [box.querySelector<HTMLElement>(".island__collapsed")!, slots] as const;
}

async function runChecks() {
  try {
    let [bar, slots] = await mount("AI Agent 开启：会话环替换蓝色数字", true);
    const ring = bar.querySelector<HTMLButtonElement>("button.claude-session-ring");
    check(ring && !bar.querySelector(".island-agent-count") && bar.lastElementChild === ring && slots.sideWidth === 0,
      "AI Agent 开启时会话环替换蓝色数字，排在最右，不加宽收起条");
    check(ring!.querySelector(".mini-ring__label")?.textContent === "5" && ring!.querySelectorAll(".mini-ring__arc").length === 4,
      "中心写总数，四种状态各一段");
    check(ring!.getAttribute("aria-label") === "等授权 1 · 等你回复 1 · 运行 2 · 完成 1，点击打开 Agent 页" && !ring!.querySelector("[title]"),
      "环用 aria-label 说明各状态数和点击去向，不用原生 title");
    openedPage = null;
    await act(async () => ring!.click());
    check(openedPage === "agents", "点击会话环打开 Agent 页");

    [bar, slots] = await mount("AI Agent 关闭：会话环在仪表槽位", false);
    const gauge = bar.querySelector(".island__gauge-slot");
    check(gauge?.querySelector("span.claude-session-ring .mini-ring") && !gauge.querySelector("button")
      && gauge.nextElementSibling?.classList.contains("island__quiet-button"), "AI Agent 关闭时会话环在仪表槽位、收起灰点之前，只显示不可点");
    check(slots.sideWidth === 26, "仪表槽位里的环让收起条加宽 26px（20 + 间距 6）");

    sessions = QUIET;
    [bar] = await mount("没有活跃会话（AI Agent 开启）：退回蓝色数字", true);
    check(bar.querySelector(".island-agent-count")?.textContent === "2" && !bar.querySelector(".claude-session-ring"),
      "没有活跃会话时不显示环，退回 fly-island 自己的蓝色会话数");
    [bar] = await mount("没有活跃会话、蓝色数字也为 0：什么都不放", true, 0);
    check(!bar.querySelector(".claude-session-ring, .island-agent-count"), "两边都没有会话时会话槽位为空");
    [bar] = await mount("没有活跃会话（AI Agent 关闭）", false);
    check(!bar.querySelector(".island__gauge-slot"), "AI Agent 关闭且没有活跃会话时不占仪表槽位");

    sessions = MISSING;
    [bar] = await mount("没装 claude-sessions：照旧显示蓝色数字", true);
    check(bar.querySelector(".island-agent-count")?.textContent === "2" && !bar.querySelector(".claude-session-ring"),
      "没检测到 claude-sessions 时不显示环，蓝色数字照旧");

    sessions = null;
    [bar] = await mount("第一次读取未返回：先空着，不闪蓝色数字", true);
    check(!bar.querySelector(".claude-session-ring, .island-agent-count"), "第一次读取返回前会话槽位先空着，蓝色数字不闪现");

    pluginOn = false;
    sessions = BUSY;
    [bar] = await mount("插件停用：照旧显示蓝色数字", true);
    check(bar.querySelector(".island-agent-count")?.textContent === "2" && !bar.querySelector(".claude-session-ring"), "插件停用时照旧显示蓝色会话数");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  }
}

if (automated) await runChecks();
else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  await Promise.all([mount("AI Agent 开启：会话环替换蓝色数字", true), mount("AI Agent 关闭：会话环在仪表槽位", false)]);
  results.textContent = "演示：AI Agent 开 / 关两种位置。加 ?test=1 运行检查。";
}
