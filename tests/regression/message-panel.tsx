// pnpm dev, then open /tests/regression/message-panel.html (demo) or ?test=1 (checks).
import { act, StrictMode, useCallback, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import { useLatestMessagePreview } from "../../src/windows/island/useLatestMessagePreview";
import { useIslandMessagePanel } from "../../src/windows/island/useIslandMessagePanel";
import { useIslandPopup } from "../../src/windows/island/useIslandPopup";
import { getExpandedIslandHeight } from "../../src/windows/island/expandedHeight";
import type { IslandMode, IslandPage } from "../../src/windows/island/types";
import { MessageArrivalsPanel } from "../../src/features/messages/arrivals/MessageArrivalsPanel";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { useMail } from "../../src/features/messages/mail/MailPanel";
import type { MailSnapshot } from "../../src/features/messages/mail/api";
import type { MessageSource } from "../../src/features/messages/messagePreview";
import { usePluginNotifications } from "../../src/features/plugins/usePluginNotifications";
import type { MediaState } from "../../src/features/media/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const automated = new URLSearchParams(location.search).has("test");
// The panel waits while the island has the focus (the cursor rests on it); here it says when.
let hovering = false;
Object.defineProperty(document, "hasFocus", { value: () => hovering });
async function update(action: () => void | Promise<void>) {
  if (automated) await act(action);
  else await action();
}
// Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
const UNAVAILABLE_MEDIA: MediaState = {
  available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable",
  title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0,
  canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false,
  repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null,
  sessions: [], updatedAt: 0,
};
const keys = ["focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-notification-access-requested", "focusd-island-qq-mail-settings"];
const originals = keys.map((key) => localStorage.getItem(key));
keys.forEach((key) => localStorage.removeItem(key));
window.addEventListener("beforeunload", () => {
  keys.forEach((key, index) => originals[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, originals[index]!));
});

let revision = 0;
const commands: { command: string; args: Record<string, unknown> }[] = [];
let mail: MailSnapshot = {
  revision: 0, email: "island-test@qq.com", configured: true, enabled: true, syncing: false,
  status: "connected", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
};
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  commands.push({ command, args });
  if (command === "request_qq_notification_access") return "allowed";
  if (command === "set_qq_notifications_enabled") return { revision: ++revision, enabled: args.enabled, status: "listening", items: [], error: null };
  if (command === "set_wechat_reminders_enabled") return { revision: ++revision, enabled: args.enabled, status: "listening", pending: false, lastAttentionAt: null, error: null };
  if (command === "get_qq_mail_state") return [mail];
  if (command === "read_qq_mail") return { id: args.messageId, content: "本周项目进度已更新", contentType: "text/plain", attachments: [] };
}, { shouldMockEvents: true });

const DURATION_MS = automated ? 700 : 8000;
// Presses on a now-playing message's player buttons (controls "media").
const mediaPresses: string[] = [];
const PLAYER = {
  playing: true,
  onPrevious: () => mediaPresses.push("previous"),
  onPlayPause: () => mediaPresses.push("playPause"),
  onNext: () => mediaPresses.push("next"),
};
let state = { mode: "collapsed" as IslandMode, page: "todo" as IslandPage };
let openedSource: MessageSource | null = null;
let setUserMode: (mode: IslandMode) => void;

function Fixture() {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [page, setPage] = useState<IslandPage>("todo");
  const [messagePanelOpen, setMessagePanelOpen] = useState(false);
  state = { mode, page };
  setUserMode = setMode;
  const canPreview = mode === "collapsed" || messagePanelOpen;
  const qq = useQQNotifications(canPreview);
  const wechat = useWeChatReminders(canPreview);
  const qqMail = useMail(canPreview);
  const plugins = usePluginNotifications(canPreview);
  const preview = useLatestMessagePreview(qq, wechat, qqMail, plugins);
  const openIslandPage = useCallback((next: IslandPage) => { setPage(next); setMode("expanded"); }, []);
  const collapseIsland = useCallback(() => setMode("collapsed"), []);
  const panel = useIslandMessagePanel({
    enabled: true, durationMs: DURATION_MS,
    notices: { preview, qqNotifications: qq, wechatReminders: wechat, qqMail, pluginNotifications: plugins, setMessagePanelOpen },
    mode, page, openIslandPage, collapseIsland,
    onOpenMessages: (source) => { openedSource = source; openIslandPage("qq"); },
  });
  const { popup, expandedIslandWidth } = useIslandPopup(mode, panel.arrivals !== null);
  const height = getExpandedIslandHeight({
    page, todoPageMode: "today", todos: [], hasMediaCommandError: false, messageSource: "qq", isReadingMail: false,
    maxPanelHeight: 490, clipboardVisibleRows: 3, agentVisibleRows: 3, agentUsageLines: 0,
    messageArrivalsHeight: panel.arrivals ? panel.height : undefined,
    popup,
  });
  return <div className="stage" style={{ "--collapsed-island-width": "300px", "--expanded-island-height": `${height}px`, "--expanded-island-width": `${expandedIslandWidth}px` } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={plugins} preview={null}
      mode={mode} page={page} popup={popup} isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle="剩余3个待办" collapsedTodoCount={null} agentSession={null} activeAgentSessionCount={0}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true, agents: false, translation: false }}
      shelfCount={null}
      onOpenPage={openIslandPage} onOpenMessages={(source) => { openedSource = source; openIslandPage("qq"); }}
      onPageChange={setPage} onWindowDragStart={() => {}} onCollapse={collapseIsland}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => {}} onReveal={() => {}} pageDigitModifiers="Alt" hoverSwitchPage={false} hoverSwitchDelayMs={0}>
      {page === "qq" && (
        <div className="message-panel">
          {panel.arrivals
            ? <MessageArrivalsPanel arrivals={panel.arrivals} onOpen={panel.open} onAction={panel.runAction} onMeasure={panel.measure} onShowAll={panel.showAll} media={PLAYER} />
            : <span className="message-panel-full">完整消息页</span>}
        </div>
      )}
      {page === "todo" && <span>待办清单</span>}
    </IslandShell>
  </div>;
}

async function notify(source: "qq" | "wechat" | "qqMail" | "plugin", title = "小林") {
  const receivedAt = Date.now();
  await update(async () => {
    if (source === "wechat") await emit("wechat-reminder-changed", {
      snapshot: { revision: ++revision, enabled: true, status: "listening", pending: true, lastAttentionAt: revision, error: null }, windowVisible: true,
    });
    if (source === "qq") await emit("qq-notifications-changed", {
      snapshot: { revision: ++revision, enabled: true, status: "listening", items: [{ id: `qq-${revision}`, title, body: "下午三点一起讨论新项目的设计方案，记得带上之前整理的资料和上周的评审记录。", createdAt: receivedAt }], error: null },
      newestId: `qq-${revision}`, windowVisible: true,
    });
    if (source === "qqMail") {
      mail = { ...mail, revision: ++revision, unreadCount: 1, items: [{ id: `mail-${revision}`, uid: revision, sender: title, subject: "本周项目进度已更新", unread: true, receivedAt }] };
      await emit("qq-mail-changed", { snapshot: mail, newestId: `mail-${revision}`, windowVisible: true });
    }
    if (source === "plugin") await emit("plugin-notification", {
      pluginId: "dev.test.build", pluginName: "构建", title, body: "main 分支构建通过", durationMs: 5000, actions: [{ id: "open", title: "查看" }, { id: "rerun", title: "重跑" }],
    });
  });
  // Arrivals are taken in an effect after the render.
  await wait(30);
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const rows = () => [...document.querySelectorAll<HTMLElement>(".message-arrivals__item")];
const senders = () => rows().map((row) => row.querySelector(".message-arrivals__sender")?.textContent);
async function wait(ms: number) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}
async function waitFor(condition: () => boolean, label: string, timeout = 2000) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`等待超时：${label}`);
    await wait(30);
  }
}
const results = document.getElementById("results")!;

async function runChecks() {
  try {
    await notify("qq");
    await waitFor(() => state.mode === "expanded" && rows().length === 1, "展开到消息页");
    check(state.page === "qq" && senders()[0] === "小林", "QQ 新消息让收起的岛展开到消息页，只列这一条");
    const islandBox = () => document.querySelector(".island")!.getBoundingClientRect();
    const headerShown = () => getComputedStyle(document.querySelector(".island__header")!).display !== "none";
    await waitFor(() => Math.round(islandBox().width) === 400, "岛收窄到卡片宽度", 1500);
    check(!headerShown() && document.querySelector(".island--popup"), "弹出时不显示顶部栏，岛宽 400");
    check(rows()[0].querySelector(".message-arrivals__body")?.textContent?.includes("设计方案") && /^\d\d:\d\d$/.test(rows()[0].querySelector(".message-arrivals__time")?.textContent ?? ""), "行里写摘要和到达时间");

    await notify("qqMail", "项目组");
    await notify("wechat");
    await waitFor(() => rows().length === 3, "后到的并进面板");
    check(senders().join(",") === "微信,项目组,小林", "面板开着时后到的消息并进来，最新的在上");
    check(rows()[0].querySelector(".message-brand-icon--wechat") && rows()[0].textContent?.includes("你收到了一条消息"), "微信也进面板");

    await notify("plugin", "构建完成");
    await waitFor(() => rows().length === 4, "插件通知并进面板");
    const actions = [...rows()[0].querySelectorAll<HTMLButtonElement>(".message-arrivals__action")];
    check(actions.map((button) => button.textContent).join(",") === "查看,重跑", "插件通知那一行带它的按钮");
    const islandBottom = () => document.querySelector(".island")!.getBoundingClientRect().bottom;
    const listBottom = () => document.querySelector(".message-arrivals")!.getBoundingClientRect().bottom;
    // The rows report their height a frame later (ResizeObserver), and the island follows.
    await waitFor(() => listBottom() <= islandBottom() - 8, "岛跟上行的高度", 1500).catch(() => undefined);
    const island = document.querySelector(".island")!.getBoundingClientRect();
    const list = document.querySelector(".message-arrivals")!.getBoundingClientRect();
    check(list.bottom <= island.bottom - 8 && island.bottom - list.bottom < 40, `岛的高度正好装下这几行（行底 ${Math.round(list.bottom)}，岛底 ${Math.round(island.bottom)}）`);

    await act(async () => actions[1].click());
    check(commands.some((entry) => entry.command === "run_plugin_notification_action" && entry.args.id === "dev.test.build" && entry.args.action === "rerun"), "点插件按钮运行动作");
    check(rows().length === 3 && senders()[0] === "微信", "运行后那一行移走");

    hovering = true;
    await wait(DURATION_MS + 300);
    check(state.mode === "expanded", "鼠标停在岛上时不收起");
    hovering = false;
    await waitFor(() => state.mode === "collapsed", "到时自己收起", 2500);
    check(state.mode === "collapsed", "离开后到时自己收起");
    await wait(30);

    await notify("qqMail", "项目组");
    await waitFor(() => rows().length === 1, "再次弹出");
    check(senders()[0] === "项目组", "收起后再来消息重新弹出，只列新的");
    await act(async () => {
      rows()[0].querySelector(".message-arrivals__row")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      rows()[0].querySelector<HTMLButtonElement>(".message-arrivals__row")!.click();
    });
    await waitFor(() => commands.some((entry) => entry.command === "read_qq_mail"), "打开邮件");
    check(openedSource === "qqMail" && rows().length === 0 && state.mode === "expanded", "点邮件那一行在岛内打开阅读页");
    await act(async () => setUserMode("collapsed"));

    await notify("qq", "老王");
    await waitFor(() => rows().length === 1, "第三次弹出");
    await act(async () => {
      const all = document.querySelector<HTMLButtonElement>(".message-arrivals__all")!;
      all.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      all.click();
    });
    check(rows().length === 0 && document.querySelector(".message-panel-full"), "点「全部消息」回到完整消息页");
    await waitFor(() => Math.round(islandBox().width) === 560, "岛回到完整宽度", 1500);
    check(headerShown() && !document.querySelector(".island--popup"), "完整消息页显示顶部栏，岛宽 560");
    await wait(DURATION_MS + 200);
    check(state.mode === "expanded", "按过之后不再自动收起");
    await notify("qq", "小张");
    check(rows().length === 0, "你自己在用展开的岛时，新消息不弹面板");

    // island.notify with icon "media" and layout "inline" (C11c): the island is the message.
    await act(async () => setUserMode("collapsed"));
    await wait(30);
    const playerIcon = "data:image/png;base64,iVBORw0KGgo=";
    await update(() => emit("plugin-notification", {
      pluginId: "dev.focusd.now-playing", pluginName: "正在播放", title: "倒数", body: "G.E.M.邓紫棋", durationMs: 6000, actions: [],
      icon: "media", layout: "inline", iconUrl: playerIcon,
    }));
    await waitFor(() => rows().length === 1, "一体成型的插件提示弹出");
    check(document.querySelector(".message-arrivals--inline") && !document.querySelector(".message-arrivals__top"), "只有一条 inline 提示时没有「新消息」标题行");
    check(rows()[0].querySelector<HTMLImageElement>(".message-brand-icon--app")?.src === playerIcon, "图标换成音乐软件的图标");
    check(getComputedStyle(rows()[0]).backgroundColor === "rgba(0, 0, 0, 0)", "没有卡片底色");
    await notify("qq", "小李");
    await waitFor(() => rows().length === 2, "第二条并进来");
    check(document.querySelector(".message-arrivals__top") && !document.querySelector(".message-arrivals--inline"), "有两条时回到标题加卡片");
    const rowWidth = rows()[0].getBoundingClientRect().width;
    const listWidth = document.querySelector(".message-arrivals__list")!.getBoundingClientRect().width;
    check(Math.abs(rowWidth - listWidth) < 1 && listWidth > 300, `卡片撑满岛的宽度（${Math.round(rowWidth)}px）`);

    // island.notify with controls "media": the player's buttons where the time would be.
    await act(async () => setUserMode("collapsed"));
    await wait(30);
    const nowPlaying = (title: string) => update(() => emit("plugin-notification", {
      pluginId: "dev.focusd.now-playing", pluginName: "正在播放", title, body: "宋冬野", durationMs: 6000, actions: [],
      icon: "media", layout: "inline", controls: "media", iconUrl: playerIcon,
    }));
    await nowPlaying("安和桥");
    await waitFor(() => rows().length === 1, "带播放按钮的提示弹出");
    const mediaButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".message-arrivals__media-button")];
    check(mediaButtons().length === 3 && !rows()[0].querySelector(".message-arrivals__time"), "三个播放按钮代替了时间");
    check(mediaButtons()[1].getAttribute("aria-label") === "暂停", "正在播放时中间是暂停");
    const pointer = (target: Element) => target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    pointer(mediaButtons()[2]);
    await act(async () => mediaButtons()[2].click());
    check(mediaPresses.join() === "next" && rows().length === 1, "点下一首交给岛屿执行，面板还在");
    await nowPlaying("董小姐");
    await waitFor(() => senders()[0] === "董小姐", "下一首的提示换上来");
    check(rows().length === 1 && document.querySelector(".message-arrivals--inline"), "同一插件带按钮的提示替换旧的，不叠两行");
    await wait(DURATION_MS + 400);
    check(rows().length === 0, "按过播放按钮后仍按时长自己收起");

    results.textContent = messages.join("\n");
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  }
}

await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Fixture /></StrictMode>); });
if (automated) await runChecks();
else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  for (const [label, action] of [
    ["QQ 消息", () => notify("qq")], ["邮件", () => notify("qqMail", "项目组")], ["微信", () => notify("wechat")],
    ["插件通知", () => notify("plugin", "构建完成")], ["收起", () => update(() => setUserMode("collapsed"))],
  ] as const) {
    const control = document.createElement("button");
    control.textContent = label;
    control.onclick = () => void action();
    document.getElementById("controls")!.append(control);
  }
  results.textContent = "点按钮看展开面板；约 8 秒后自己收起。";
}
