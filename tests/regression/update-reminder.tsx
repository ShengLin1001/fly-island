// pnpm dev, then open /tests/regression/update-reminder.html (demo) or ?test=1 (checks).
// The update check finds a made-up v0.3.4 (updateDemo.ts). The island shows its two reminders and
// the settings window below its About page; all three share one updater, as in the app.
import "./updateReminderEnv";
import "./settingsMocks";
import { act, StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import type { IslandMode } from "../../src/windows/island/types";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { requestSettingsFocus } from "../../src/windows/settings/storage";
import { I18nProvider } from "../../src/i18n";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { useMail } from "../../src/features/messages/mail/MailPanel";
import type { MediaState } from "../../src/features/media/api";
import type { PluginNotificationsController } from "../../src/features/plugins/usePluginNotifications";
import { checkForUpdate, reloadPreferences } from "../../src/features/updater/updaterController";
import { UPDATE_PREFERENCES_KEY } from "../../src/features/updater/storage";

const automated = new URLSearchParams(location.search).has("test");
// Only the checks wrap updates in act(); in the demo the download updates the page by itself.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: automated });
async function update(action: () => void | Promise<void>) {
  if (automated) await act(action);
  else await action();
}
const NO_PLUGIN_NOTIFICATIONS: PluginNotificationsController = { notification: null, dismiss: () => {}, runAction: () => {} };
// Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
const UNAVAILABLE_MEDIA: MediaState = {
  available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable",
  title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0,
  canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false,
  repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null,
  sessions: [], updatedAt: 0,
};

// A version skipped earlier would hide the reminder: start without one, and put it back on leaving.
const savedPreferences = localStorage.getItem(UPDATE_PREFERENCES_KEY);
localStorage.removeItem(UPDATE_PREFERENCES_KEY);
reloadPreferences();
window.addEventListener("beforeunload", () => {
  if (savedPreferences === null) localStorage.removeItem(UPDATE_PREFERENCES_KEY);
  else localStorage.setItem(UPDATE_PREFERENCES_KEY, savedPreferences);
});

function Island({ mode }: { mode: IslandMode }) {
  const qq = useQQNotifications(false);
  const wechat = useWeChatReminders(false);
  const qqMail = useMail(false);
  return <div className="stage" style={{ "--collapsed-island-width": "300px", "--expanded-island-height": "220px", "--expanded-island-width": "460px" } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={NO_PLUGIN_NOTIFICATIONS} preview={null}
      mode={mode} page="todo" isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle="剩余3个待办" collapsedTodoCount={null} agentSession={null} activeAgentSessionCount={0}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: false, wechat: false, qqMail: false, agents: false, translation: false }}
      shelfCount={null}
      onOpenPage={() => {}} onOpenMessages={() => {}}
      onPageChange={() => {}} onWindowDragStart={() => {}} onCollapse={() => {}}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => {}} onReveal={() => {}} pageDigitModifiers="Alt" hoverSwitchPage={false} hoverSwitchDelayMs={0}>
      <span>待办清单</span>
    </IslandShell>
  </div>;
}

const results = document.getElementById("results")!;

async function mount() {
  // The island's reminders open About through this request; here it is made up front.
  requestSettingsFocus("updates");
  await update(() => {
    createRoot(document.getElementById("collapsed")!).render(<StrictMode><Island mode="collapsed" /></StrictMode>);
    createRoot(document.getElementById("expanded")!).render(<StrictMode><Island mode="expanded" /></StrictMode>);
    createRoot(document.getElementById("settings")!).render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>);
  });
  // The island checks 20 s after launch; About checks when it opens. Wait for that check.
  await update(checkForUpdate);
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}

async function runChecks() {
  try {
    await mount();
    const badge = document.querySelector<HTMLElement>("#collapsed .island-update-badge");
    check(badge?.getAttribute("aria-label") === "发现新版本 v0.3.4，点击查看", "收起条显示新版本按钮，悬停文字带版本号");
    check(document.querySelector("#expanded .island-settings-button__dot"), "展开后设置按钮带提示圆点");
    const install = [...document.querySelectorAll<HTMLButtonElement>("#settings button")].find((button) => button.textContent?.includes("下载并安装"));
    check(install && !install.disabled, "设置的关于页给出「下载并安装」");
    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

if (automated) {
  void runChecks();
} else {
  const again = document.createElement("button");
  again.type = "button";
  again.textContent = "重新开始（清掉「跳过此版本」）";
  again.addEventListener("click", () => {
    localStorage.removeItem(UPDATE_PREFERENCES_KEY);
    location.reload();
  });
  document.getElementById("controls")!.append(again);
  void mount().then(() => { results.textContent = "演示：后台检查发现 v0.3.4。加 ?test=1 运行检查。"; });
}
