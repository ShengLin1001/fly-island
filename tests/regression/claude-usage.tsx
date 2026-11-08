// pnpm dev, then open /tests/regression/claude-usage.html (demo, card open) or ?test=1 (checks).
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
import { ClaudeUsageGauge } from "../../src/features/claude-usage/ClaudeUsageGauge";
import { PlanKeyFields } from "../../src/features/claude-usage/PlanKeyFields";
import "../../src/features/plugins/PluginCard.css";
import "../../src/features/plugins/PluginDetailPage.css";
import "../../src/features/plugins/PluginsSettingsSection.css";
import "../../src/windows/settings/LayoutEditor.css";
import type { AgentUsage } from "../../src/features/agent-status/api";
import { CLAUDE_USAGE_GAUGE_WIDTH, USAGE_COLORS, USAGE_PROVIDERS } from "../../src/features/claude-usage/usageRing";
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

const MINUTE = 60_000;
const at = (minutes: number) => Date.now() + minutes * MINUTE;
// Shaped like AgentUsage in src-tauri/src/agent_status/usage.rs.
const snapshot = (overrides: Partial<AgentUsage> = {}): AgentUsage => ({
  updatedAt: Date.now() - 2 * MINUTE,
  fiveHour: { name: "", used: 42, resetsAt: at(132.5) },
  sevenDay: { name: "", used: 76, resetsAt: at(3 * 1440 + 4 * 60 - 0.5) },
  models: [],
  plan: null,
  ...overrides,
});
let current: AgentUsage | null = snapshot();
// The other agents' rings, side by side with Claude's in the second fixture.
const others: Record<string, AgentUsage> = {
  codex: snapshot({ source: "codex", plan: "Plus", fiveHour: { name: "", used: 18, resetsAt: at(200) }, sevenDay: { name: "", used: 40, resetsAt: at(5000) } }),
  glm: snapshot({ source: "glm", plan: "GLM Coding Pro", fiveHour: { name: "", used: 35, resetsAt: at(90.5) }, sevenDay: { name: "", used: 52, resetsAt: at(2 * 1440 + 18 * 60 - 0.5) }, models: [{ name: "mcpMonth", used: 8, resetsAt: null }] }),
  kimi: snapshot({ source: "kimi", fiveHour: { name: "", used: 60, resetsAt: at(45) }, sevenDay: null, models: [{ name: "month", used: 30, resetsAt: at(20000) }] }),
};
let reads = 0;
let refreshes = 0;
const planReads: string[] = [];
// The plugin page's key fields: what reached set_plan_key, and which keys are saved.
const keyWrites: string[] = [];
const savedKeys = new Set<string>();
mockIPC((command, payload) => {
  if (command === "has_plan_key") return savedKeys.has((payload as { provider: string }).provider);
  if (command === "set_plan_key") {
    const { provider, key } = payload as { provider: string; key: string };
    keyWrites.push(`${provider}:${key}`);
    if (key.trim()) savedKeys.add(provider);
    else savedKeys.delete(provider);
    return savedKeys.has(provider);
  }
  if (command === "get_codex_usage") return others.codex;
  if (command === "get_plan_usage") {
    const { provider, refresh } = payload as { provider: string; refresh: boolean };
    planReads.push(`${provider}:${refresh}`);
    return others[provider];
  }
  if (command === "refresh_claude_usage") {
    refreshes += 1;
    return;
  }
  if (command === "get_qq_mail_state") return [{
    revision: 0, email: "", configured: false, enabled: false, syncing: false,
    status: "disabled", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
  }];
  if (command === "get_agent_usage") {
    reads += 1;
    return current;
  }
}, { shouldMockEvents: true });

/** The bar with Claude's ring alone (`all` false, what the checks drive) or every agent's. */
function Fixture({ all = false }: { all?: boolean }) {
  const qq = useQQNotifications(true);
  const wechat = useWeChatReminders(true);
  const qqMail = useMail(true);
  const preview = useLatestMessagePreview(qq, wechat, qqMail, NO_PLUGIN_NOTIFICATIONS);
  const providers = all ? USAGE_PROVIDERS : USAGE_PROVIDERS.slice(0, 1);
  const sideWidth = providers.length * CLAUDE_USAGE_GAUGE_WIDTH;
  return <div className={`stage${all ? " stage--all" : ""}`} style={{ "--collapsed-island-width": `${280 + sideWidth}px` } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={NO_PLUGIN_NOTIFICATIONS} preview={preview}
      mode="collapsed" page="todo" isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle="剩余3个待办" collapsedTodoCount={null} agentSession={null} activeAgentSessionCount={0}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: false, wechat: false, qqMail: false, agents: false, translation: false }}
      shelfCount={null} collapsedSlots={{ gauges: providers.map((provider) => <ClaudeUsageGauge key={provider.id} provider={provider} />), sideWidth }}
      onOpenPage={() => {}} onOpenMessages={() => {}}
      onPageChange={() => {}} onWindowDragStart={() => {}} onCollapse={() => {}}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => {}} onReveal={() => {}} pageDigitModifiers="Alt">
      <span>待办清单</span>
    </IslandShell>
  </div>;
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const button = () => document.querySelector<HTMLButtonElement>(".island__gauge-slot .claude-usage-gauge")!;
const anchor = () => button().parentElement!;
const card = () => document.querySelector<HTMLElement>(".island-hover-card");
const cardLines = () => [...card()!.querySelectorAll(".island-hover-card__line")].map((line) => line.textContent);
const arcColors = () => [...button().querySelectorAll(".mini-ring__arc")].map((arc) => arc.getAttribute("stroke"));
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
// A click re-reads the snapshot, so a new one shows without waiting for the 30-second timer.
const push = async (next: AgentUsage | null) => {
  current = next;
  await act(async () => button().click());
  await wait(20);
};
const hover = async () => {
  await act(async () => { anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
  await wait(260);
};
const leave = () => act(async () => { anchor().dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })); });
const results = document.getElementById("results")!;

async function runChecks() {
  try {
    await wait(50);
    check(button() && button().nextElementSibling === null && anchor().parentElement?.classList.contains("island__gauge-slot"), "用量环在仪表槽位里，是一个按钮");
    check(!button().title && !button().querySelector("[title]"), "不用原生 title 提示");
    check(button().querySelectorAll(".mini-ring__track").length === 2, "同心双环：两条底轨");
    check(arcColors().join() === [USAGE_COLORS.normal, USAGE_COLORS.warn].join(), "外环 42% 常态色，内环 76% 用 ≥70% 的颜色");

    await act(async () => { anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
    await wait(100);
    check(!card(), "停留不到 200ms 不出现卡片");
    await wait(160);
    const island = document.querySelector(".island")!.getBoundingClientRect();
    const box = card()!.getBoundingClientRect();
    check(card()!.closest(".stage") && !card()!.closest(".island"), "卡片画在舞台里、岛外面");
    check(box.top >= island.bottom && Math.abs(box.left + box.width / 2 - (island.left + island.width / 2)) < 1.5, "卡片在胶囊正下方居中");
    check(getComputedStyle(card()!).pointerEvents === "none", "卡片不接收鼠标");
    const lines = cardLines();
    check(lines[0] === "Claude Code" && lines[1] === "5 小时 42% · 2 小时 13 分后重置" && lines[2] === "7 天 76% · 3 天 4 小时后重置" && lines[3] === "2 分钟前更新 · 来自 claude-hud", `卡片内容：${lines.join(" / ")}`);
    await leave();
    check(!card(), "移开后卡片消失");

    // With the pointer on the ring, the card steps out from under the cursor.
    const ring = button().getBoundingClientRect();
    const pointerX = ring.left + ring.width / 2;
    await act(async () => { anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: pointerX, clientY: ring.top + ring.height / 2 })); });
    await wait(260);
    const placed = card()!.getBoundingClientRect();
    check(placed.right <= pointerX - 8 || placed.left >= pointerX + 22, `鼠标停在环上时，卡片避开指针（卡片 ${Math.round(placed.left)}–${Math.round(placed.right)}，指针 ${Math.round(pointerX)}）`);
    check(placed.top >= document.querySelector(".island")!.getBoundingClientRect().bottom, "避开指针时卡片仍在胶囊下方");
    await leave();

    await push(snapshot({ source: "api", error: { kind: "loginRequired", message: "HTTP 401" } }));
    check(arcColors().join() === [USAGE_COLORS.normal, USAGE_COLORS.warn].join(), "直接查询失败但数据仍新鲜时，环不变灰");
    await hover();
    const failedLines = cardLines();
    check(failedLines[3] === "需要在 Claude Code 里重新登录" && failedLines[4] === "2 分钟前更新 · 来自 Anthropic", `卡片写出失败原因和来源：${failedLines.join(" / ")}`);
    await leave();

    await push(snapshot({ updatedAt: Date.now() - 20 * MINUTE }));
    check(arcColors().every((color) => color === USAGE_COLORS.stale), "超过 15 分钟的数据整体变灰");
    await push(null);
    check(button().querySelectorAll(".mini-ring__arc").length === 0 && button().querySelectorAll(".mini-ring__track").length === 2, "没有 claude-hud 快照时只显示灰色底轨");
    await hover();
    check(cardLines().join("|") === "Claude Code|暂无 Claude 用量（需要本机的 magpie 网关、claude-hud 的用量快照，或在插件设置里打开「直接向 Anthropic 查询」）", "卡片说明数据从哪来");
    await leave();

    const before = { reads, refreshes };
    await act(async () => button().click());
    await wait(20);
    check(refreshes === before.refreshes + 1 && reads === before.reads + 1, "点击环先请求刷新，再重新读取用量");
    await act(async () => button().focus({ focusVisible: true } as FocusOptions));
    if (button().matches(":focus-visible")) check(card(), "键盘聚焦时也显示卡片");
    await act(async () => button().blur());
    check(!card(), "失去焦点后卡片消失");

    // Every agent switched on: one ring each, in order and colour, side by side inside the island.
    const all = [...document.querySelectorAll<HTMLButtonElement>(".stage--all .claude-usage-gauge")];
    check(all.map((gauge) => gauge.dataset.provider).join() === "claudeCode,codex,glm,kimi", "四个环按 Claude Code、Codex、GLM、Kimi 排列");
    const colorsOf = (gauge: HTMLElement) => [...gauge.querySelectorAll(".mini-ring__arc")].map((arc) => arc.getAttribute("stroke"));
    check(USAGE_PROVIDERS.slice(1).every((provider, index) => colorsOf(all[index + 1]).every((color) => color === provider.color)), "Codex、GLM、Kimi 各用自己的颜色");
    const allIsland = document.querySelector(".stage--all .island")!.getBoundingClientRect();
    const boxes = all.map((gauge) => gauge.getBoundingClientRect());
    check(boxes.every((box, index) => box.right <= allIsland.right && (index === 0 || box.left >= boxes[index - 1].right)), "四个环都在胶囊里，互不重叠");
    check(planReads.includes("glm:false") && planReads.includes("kimi:false"), "GLM 和 Kimi 的环按各自的 provider 读用量");
    await act(async () => all[2].click());
    await wait(20);
    check(planReads.includes("glm:true"), "点击 GLM 的环会重新向 GLM 查询");
    const glmAnchor = all[2].parentElement!;
    await act(async () => { glmAnchor.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
    await wait(260);
    check(cardLines().join(" / ") === "GLM · GLM Coding Pro / 5 小时 35% · 1 小时 31 分后重置 / 7 天 52% · 2 天 18 小时后重置 / MCP 本月 8% / 2 分钟前更新 · 来自智谱开放平台", `GLM 卡片：${cardLines().join(" / ")}`);
    await act(async () => { glmAnchor.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })); });

    // The plugin page: a password field per plan switched on; the key goes to set_plan_key and never back.
    const fields = [...document.querySelectorAll<HTMLElement>("#plan-keys [data-plan-key]")];
    check(fields.map((field) => field.dataset.planKey).join() === "glm", "只为打开的 GLM 显示 API Key 输入框");
    const input = fields[0].querySelector("input")!;
    const hint = () => fields[0].querySelector(".plan-key__status")!.textContent;
    const buttons = () => [...fields[0].querySelectorAll("button")].map((button) => button.textContent);
    check(input.type === "password" && input.autocomplete === "off" && hint() === "未保存" && buttons().join() === "保存", "密码框，未保存时只有保存按钮");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "sk-secret-123");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => fields[0].querySelector("button")!.click());
    await wait(20);
    check(keyWrites.join() === "glm:sk-secret-123" && input.value === "" && hint() === "已保存" && buttons().join() === "保存,删除", "保存后清空输入框，显示已保存和删除按钮");
    check(!document.body.innerHTML.includes("sk-secret-123") && input.placeholder === "已保存，粘贴新的 Key 可替换", "保存后页面里不再有这个 Key");
    await act(async () => fields[0].querySelectorAll("button")[1].click());
    await wait(20);
    check(keyWrites[keyWrites.length - 1] === "glm:" && hint() === "未保存", "删除时传空 Key，回到未保存");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  }
}

await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Fixture /><Fixture all /></StrictMode>); });
const keysHost = Object.assign(document.createElement("div"), { id: "plan-keys" });
// The settings window's background (SettingsWindow.css), for the demo's look.
keysHost.style.cssText = "width: 460px; margin: 24px; padding: 16px; background: #17191d; color: var(--color-text);";
document.getElementById("fixture")!.after(keysHost);
await act(async () => { createRoot(keysHost).render(<PlanKeyFields settings={{ glm: true, kimi: !automated }} disabled={false} />); });
if (automated) await runChecks();
else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  await new Promise((resolve) => setTimeout(resolve, 50));
  anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  results.textContent = "演示：仪表槽位里的用量同心双环（外 5 小时、内 7 天）和悬停卡片，下面是四家同时打开。加 ?test=1 运行检查。";
}
