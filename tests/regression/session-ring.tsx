// pnpm dev, then open /tests/regression/session-ring.html (demo) or ?test=1 (checks).
import { act, StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import { useLatestMessagePreview } from "../../src/windows/island/useLatestMessagePreview";
import type { PluginNotificationsController } from "../../src/features/plugins/usePluginNotifications";

const NO_PLUGIN_NOTIFICATIONS: PluginNotificationsController = { notification: null, dismiss: () => {}, runAction: () => {} };
import { useCollapsedSlots } from "../../src/windows/island/useCollapsedSlots";
import type { CollapsedSlots } from "../../src/windows/island/types";
import type { AgentActivity } from "../../src/features/center-pattern";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
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

const NOW = Date.now();
const session = (sessionId: string, phase: AgentSessionSummary["phase"], title: string, minutesAgo = 0): AgentSessionSummary => ({
  provider: "claudeCode", sessionId, cwd: "F:\\code\\fly-island", title, model: null, effort: null, phase,
  lastMessage: null, updatedAt: NOW - minutesAgo * 60_000, host: null, turnStartedAt: null,
});
// Needs you 1, your turn 1 (finished, its reply asks something), running 2, done 2 (one seen 2
// minutes ago, one an hour ago: the ring has no clock of its own and shows what the page lists).
const BUSY = [
  session("a1", "waiting", "修复登录"),
  { ...session("b2", "completed", "写测试"), replyAsks: true },
  session("c3", "running", "重构"),
  session("d4", "running", "文档"),
  session("e5", "completed", "已看过", 2),
  session("f6", "completed", "很久以前", 60),
];
// Sessions waiting on you count as asking only until looked at (roadmap B15).
const UNSEEN: ReadonlySet<string> = new Set(["claudeCode:a1", "claudeCode:b2"]);
// The Agent page lists nothing (say, every session has quit and quit ones are hidden).
const QUIET: AgentSessionSummary[] = [];
// Twelve: past nine the grid's last cell is a plus.
const CROWD = [...BUSY, ...["g7", "h8", "i9", "j10", "k11", "l12"].map((id, index) => session(id, index % 3 ? "running" : "stale", id))];
// What the mocked host answers; each scenario sets these, then mounts a fresh island.
let pluginOn = true;
let pluginSettings: Record<string, unknown> = {};
let sessions: AgentSessionSummary[] = BUSY;
mockIPC((command) => {
  if (command === "get_qq_mail_state") return [{
    revision: 0, email: "", configured: false, enabled: false, syncing: false,
    status: "disabled", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
  }];
  if (command === "list_plugins") return {
    allowThirdParty: false, nodeAvailable: false, pluginsDir: "", autoUpdate: false, trustedPublishers: [],
    plugins: [{ id: "focusd.session-ring", builtin: true, enabled: pluginOn, status: "running", settings: pluginSettings }],
  };
}, { shouldMockEvents: true });

let openedPage: string | null = null;
const OPEN_AGENTS = () => { openedPage = "agents"; };
// One array for every render: a new one each time would read as new agent activity.
const NO_AGENTS: AgentActivity[] = [];

// The appearance's corners as stageStyle.ts sets them on the stage; none: the stylesheet's defaults.
let corners: CSSProperties = {};

function Island({ agents, count, list, report }: { agents: boolean; count: number; list: AgentSessionSummary[]; report: (slots: CollapsedSlots) => void }) {
  const slots = useCollapsedSlots({ paused: true, agents: NO_AGENTS, sessions: list, unseen: UNSEEN, agentsOn: agents, onOpenAgents: OPEN_AGENTS });
  report(slots);
  const qq = useQQNotifications(true);
  const wechat = useWeChatReminders(true);
  const qqMail = useMail(true);
  const preview = useLatestMessagePreview(qq, wechat, qqMail, NO_PLUGIN_NOTIFICATIONS);
  return <div className="stage" style={{ "--collapsed-island-width": "300px", ...corners } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={NO_PLUGIN_NOTIFICATIONS} preview={preview}
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
    createRoot(box).render(<StrictMode><Island agents={agents} count={count} list={sessions} report={(next) => { slots = next; }} /></StrictMode>);
  });
  // Let the plugin list and the session read come back.
  // Timers, not animation frames: a background tab gets no frames (the demo is viewed in one).
  for (let frame = 0; frame < 10; frame += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 16)); });
  return [box.querySelector<HTMLElement>(".island__collapsed")!, slots] as const;
}

async function runChecks() {
  try {
    let [bar, slots] = await mount("AI Agent 开启：像素格替换蓝色数字", true);
    let ring = bar.querySelector<HTMLButtonElement>("button.session-ring");
    check(ring && !bar.querySelector(".island-agent-count") && bar.lastElementChild?.contains(ring!) && !slots.sideWidth,
      "AI Agent 开启时会话格替换蓝色数字，排在最右，不加宽收起条");
    const cells = [...ring!.querySelectorAll<HTMLElement>(".session-grid--3 .session-grid__cell")];
    check(cells.length === 9 && cells.map((cell) => cell.dataset.state ?? "").join(",") === "needs,yourturn,working,working,done,done,,,",
      "默认像素格：Agent 页列出的 6 个会话用 3×3 格，按等你确认、等你回复、运行、完成的顺序点亮（一小时前完成的照样算）");
    const box = ring!.querySelector(".session-grid")!.getBoundingClientRect();
    check(box.width === 22 && box.height === 22 && getComputedStyle(cells[0]).backgroundColor === "rgb(255, 69, 58)",
      "3×3 格 22px 见方，格子用状态色");
    check(ring!.getAttribute("aria-label") === "等你确认 1 · 等你回复 1 · 运行 2 · 完成 2，点击打开 Agent 页" && !ring!.querySelector("[title]"),
      "环用 aria-label 说明各状态数和点击去向，不用原生 title");
    openedPage = null;
    await act(async () => ring!.click());
    check(openedPage === "agents", "点击会话环打开 Agent 页");

    pluginSettings = { style: "ring" };
    [bar] = await mount("样式选分段环：中心写总数", true);
    ring = bar.querySelector<HTMLButtonElement>("button.session-ring");
    check(ring!.querySelector(".mini-ring__label")?.textContent === "6" && ring!.querySelectorAll(".mini-ring__arc").length === 4,
      "分段环：中心写总数，四种状态各一段");
    check(getComputedStyle(ring!.querySelector(".mini-ring__label")!).fontSize === "12px", "分段环中心数字 12px");
    pluginSettings = { style: "bar" };
    [bar] = await mount("样式选状态条：总数加分段条", true);
    const parts = [...bar.querySelectorAll<HTMLElement>(".session-bar__part")];
    check(bar.querySelector(".session-bar__count")?.textContent === "6" && parts.map((part) => part.dataset.state).join(",") === "needs,yourturn,working,done"
      && parts[2].getBoundingClientRect().width > parts[0].getBoundingClientRect().width,
      "状态条：写总数，每种状态一段，按会话数分长短");
    pluginSettings = { style: "ring", showCount: false };
    [bar] = await mount("关掉「显示会话数」：分段环中心不写数字", true);
    check(!bar.querySelector(".mini-ring__label") && bar.querySelectorAll(".mini-ring__arc").length === 4
      && bar.querySelector(".mini-ring")!.getBoundingClientRect().width === 24, "关掉「显示会话数」：分段环只画四段、不写数字，大小不变");
    pluginSettings = { style: "bar", showCount: false };
    [bar] = await mount("关掉「显示会话数」：状态条前面不写数字", true);
    check(!bar.querySelector(".session-bar__count") && bar.querySelectorAll(".session-bar__part").length === 4, "关掉「显示会话数」：状态条只剩分段条");
    pluginSettings = { style: "signal" };
    corners = { "--island-corner-radius-size": 16, "--island-corner-shape": "squircle" } as CSSProperties;
    [bar] = await mount("样式选信号格：每种颜色一根柱子，每个会话一格（岛屿圆角 16、方圆）", true);
    const columns = [...bar.querySelectorAll<HTMLElement>(".session-signal__column")];
    const bars = (index: number) => [...columns[index].querySelectorAll<HTMLElement>(".session-signal__bar")];
    const box16 = bars(0)[0].getBoundingClientRect();
    check(columns.map((column) => `${column.dataset.column}${column.querySelectorAll("[data-state]").length}`).join(",") === "done2,working2,yourturn1,needs1",
      "信号格：从左到右完成、运行、等你回复、等你确认，每个会话亮一格");
    check(box16.height === 3 && box16.width === 6 && getComputedStyle(bars(3)[0]).backgroundColor === "rgb(255, 69, 58)"
      && columns.every((column) => column.children.length === 5 && column.getBoundingClientRect().height === 19)
      && box16.bottom === columns[0].getBoundingClientRect().bottom && !bars(3)[1].dataset.state,
    "横条 6×3px、状态色，每根柱子 5 格一样高，从下往上亮，没亮的是暗格");
    const radius16 = parseFloat(getComputedStyle(bars(0)[0]).borderTopLeftRadius);
    corners = { "--island-corner-radius-size": 40, "--island-corner-shape": "round" } as CSSProperties;
    [bar] = await mount("信号格：岛屿圆角 40、圆角样式「圆角」", true);
    const round = bar.querySelector<HTMLElement>(".session-signal__bar")!;
    check(Math.abs(radius16 - (16 * 22 / 30) * 3 / 38) < 0.01 && getComputedStyle(round).borderTopLeftRadius === "1.5px"
      && getComputedStyle(round).getPropertyValue("corner-shape") !== getComputedStyle(bars(0)[0]).getPropertyValue("corner-shape"),
    "横条圆角跟外观的岛屿圆角等比缩放（最大半个条高），圆角样式（方圆 / 圆角）跟着变");
    corners = {};
    sessions = CROWD;
    [bar] = await mount("信号格：12 个会话，绿柱超过 5 格时横条变 2px", true);
    const green = [...bar.querySelectorAll<HTMLElement>(".session-signal__column[data-column='working'] .session-signal__bar")];
    check(green.length === 7 && green[0].getBoundingClientRect().height === 2 && green[6].dataset.state === "stale"
      && bar.querySelectorAll(".session-signal__column[data-column='done'] .session-signal__bar").length === 7,
    "一根柱子超过 5 格时每根柱子都加到最多 7 格、横条变 2px，可能已停的画在上面");

    pluginSettings = {};
    [bar] = await mount("12 个会话：最后一格是加号", true);
    const crowd = [...bar.querySelectorAll<HTMLElement>(".session-grid__cell")];
    check(crowd.length === 9 && crowd[8].dataset.state === "more" && crowd[0].dataset.state === "needs", "超过 9 个会话：亮最急的 8 个，最后一格是加号");
    sessions = BUSY.slice(0, 3);
    [bar] = await mount("三个会话：2×2 格", true);
    check(bar.querySelectorAll(".session-grid--2 .session-grid__cell").length === 4 && bar.querySelectorAll(".session-grid__cell[data-state]").length === 3,
      "四个以内用 2×2 格，没用到的格子留作暗点");
    sessions = BUSY;

    [bar, slots] = await mount("AI Agent 关闭：没有会话环", false);
    check(!bar.querySelector(".session-ring") && !slots.agentCount, "AI Agent 关闭时不显示会话环");

    sessions = QUIET;
    [bar] = await mount("没有要显示的会话：退回蓝色数字", true);
    check(bar.querySelector(".island-agent-count")?.textContent === "2" && !bar.querySelector(".session-ring"),
      "没有要显示的会话时不显示环，退回蓝色会话数");
    [bar] = await mount("蓝色数字也为 0：什么都不放", true, 0);
    check(!bar.querySelector(".session-ring, .island-agent-count"), "两边都没有会话时会话槽位为空");

    pluginOn = false;
    sessions = BUSY;
    [bar] = await mount("插件停用：照旧显示蓝色数字", true);
    check(bar.querySelector(".island-agent-count")?.textContent === "2" && !bar.querySelector(".session-ring"), "插件停用时照旧显示蓝色会话数");

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
  // Every style with 1, 3, 6 and 12 sessions, for looking at side by side.
  const sets: [string, AgentSessionSummary[]][] = [["1", BUSY.slice(2, 3)], ["3", BUSY.slice(0, 3)], ["6", BUSY], ["12", CROWD]];
  for (const [style, name] of [["grid", "像素格"], ["ring", "分段环"], ["bar", "状态条"], ["signal", "信号格"]]) {
    pluginSettings = { style };
    for (const [count, list] of sets) {
      sessions = list;
      await mount(`${name}：${count} 个会话`, true);
    }
  }
  // Signal bars under the appearance's corners: the smallest radius, the largest, and round.
  sessions = BUSY;
  for (const [radius, shape] of [[16, "squircle"], [40, "squircle"], [16, "round"]] as const) {
    corners = { "--island-corner-radius-size": radius, "--island-corner-shape": shape } as CSSProperties;
    await mount(`信号格：岛屿圆角 ${radius}，${shape === "round" ? "圆角" : "方圆"}`, true);
  }
  corners = {};
  for (const [style, name] of [["ring", "分段环"], ["bar", "状态条"]]) {
    pluginSettings = { style, showCount: false };
    await mount(`${name}：关掉「显示会话数」`, true);
  }
  results.textContent = "演示：收起条上的 Agent 会话环。加 ?test=1 运行检查。";
}
