import type { ReactNode } from "react";
import { Bell, Bot, CalendarDays, ClipboardList, Inbox, Languages, ListTodo, Minus, Music, RotateCcw, Settings, type LucideIcon } from "lucide-react";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MessageSource } from "../../features/messages/messagePreview";
import { useUpdateReminder } from "../../features/updater/useBackgroundUpdateCheck";
import { useTranslation } from "../../i18n";
import { isPageEnabled, pageShortcutLabel, type IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import { usePageHoverSwitch } from "./usePageHoverSwitch";
import "./IslandHeader.css";

type BuiltinPageButton = "todo" | "music" | "calendar" | "clipboard" | "shelf";

/** The built-in pages' buttons, left to right, with the icons Settings uses for them (SettingsSidebar.tsx). */
const PAGE_BUTTONS: { page: BuiltinPageButton; Icon: LucideIcon }[] = [
  { page: "todo", Icon: ListTodo },
  { page: "music", Icon: Music },
  { page: "calendar", Icon: CalendarDays },
  { page: "clipboard", Icon: ClipboardList },
  { page: "shelf", Icon: Inbox },
];

type IslandHeaderProps = {
  page: IslandPage;
  features: IslandFeatures;
  showTitle: boolean;
  isDetached: boolean;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  qqNotificationCount: number;
  wechatPending: boolean;
  onPageChange: (page: IslandPage) => void;
  onCollapse: () => void;
  /** With "updates", opens About (its version and updates), for the new-version reminder. */
  onOpenSettings: (section?: "updates") => void;
  onOpenMessages: (source: MessageSource) => void;
  onOpenTranslator: (() => void) | null;
  onResetPosition: () => void;
  /** False when minimizing tucks the island to the top edge instead. */
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Modifiers shown with each page number, such as "Alt" or "Ctrl+Shift". */
  pageDigitModifiers: string;
  /** Resting the pointer on a page button opens its page. */
  hoverSwitchPage: boolean;
  hoverSwitchDelayMs: number;
  /** Buttons for plugin pages, after the built-in page buttons. */
  pluginPageButtons?: ReactNode;
  /** Buttons of the open page, first among the window actions. */
  pageActions?: ReactNode;
};

/** Header of the expanded island: agent status, page buttons (icons), collapse target and window actions. */
export function IslandHeader({
  page,
  features,
  showTitle,
  isDetached,
  agentVisualState,
  agentStatusLabel,
  qqNotificationCount,
  wechatPending,
  onPageChange,
  onCollapse,
  onOpenSettings,
  onOpenMessages,
  onOpenTranslator,
  onResetPosition,
  minimizesToTray,
  onMinimize,
  pageDigitModifiers,
  hoverSwitchPage,
  hoverSwitchDelayMs,
  pluginPageButtons,
  pageActions,
}: IslandHeaderProps) {
  const t = useTranslation();
  const updateVersion = useUpdateReminder();
  const hoverSwitch = usePageHoverSwitch(hoverSwitchPage, hoverSwitchDelayMs, onPageChange);
  const settingsLabel = updateVersion ? t.settings.project.update.islandReminder(updateVersion) : t.settings.title;
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  const withShortcut = (label: string, target: IslandPage) => {
    const shortcut = pageShortcutLabel(features, target, pageDigitModifiers);
    return shortcut ? `${label} (${shortcut})` : label;
  };
  const pageLabel = (target: BuiltinPageButton) => ({
    todo: t.island.todoList,
    music: t.island.music,
    calendar: t.island.calendar,
    clipboard: t.island.clipboardHistory,
    shelf: t.island.shelf,
  })[target];
  const agentStatusIconClassName = [
    "island__agent-status-icon",
    `island__agent-status-icon--${agentVisualState}`,
  ].join(" ");

  return (
    <header className="island__header">
      <div className="island__title">
        {features.agents ? (
          // The status light doubles as the way into the Agent page.
          <button
            className={`island__agent-button${page === "agents" ? " island__agent-button--active" : ""}`}
            type="button"
            aria-label={withShortcut(`${agentStatusLabel} · ${t.agent.sessions.open}`, "agents")}
            aria-pressed={page === "agents"}
            {...hoverSwitch("agents")}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("agents");
            }}
          >
            <Bot className={agentStatusIconClassName} size={16} strokeWidth={1.8} absoluteStrokeWidth aria-hidden="true" />
          </button>
        ) : (
          <Bot
            className={agentStatusIconClassName}
            size={16}
            strokeWidth={1.5}
            absoluteStrokeWidth
            aria-label={agentStatusLabel}
          />
        )}
        {showTitle && <span>fly-island</span>}
      </div>

      <div className="editor-dots" aria-label={t.island.editor}>
        {PAGE_BUTTONS.filter(({ page: target }) => features[target]).map(({ page: target, Icon }) => (
          <button
            key={target}
            className={`dot-button dot-button--${target}${page === target ? " dot-button--active" : ""}`}
            type="button"
            aria-label={withShortcut(pageLabel(target), target)}
            aria-pressed={page === target}
            {...hoverSwitch(target)}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange(target);
            }}
          >
            <Icon size={15} strokeWidth={1.8} absoluteStrokeWidth aria-hidden="true" />
          </button>
        ))}
        {pluginPageButtons}
      </div>

      <button
        className="island__collapse-target"
        type="button"
        aria-label={t.island.collapseIsland}
        data-window-drag="false"
        onClick={onCollapse}
      />

      <div className="window-actions">
        {pageActions}
        <button
          className="icon-button island-settings-button"
          type="button"
          aria-label={settingsLabel}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings(updateVersion ? "updates" : undefined);
          }}
        >
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          {updateVersion && <span className="island-settings-button__dot" aria-hidden="true" />}
        </button>
        {isPageEnabled("qq", features) && <button className={`icon-button island-message-button${page === "qq" ? " island-message-button--active" : ""}`} type="button" aria-label={withShortcut(t.messages.label(messageBadgeLabel), "qq")} aria-pressed={page === "qq"} onClick={() => onOpenMessages(wechatPending ? "wechat" : "qq")}>
          <Bell size={16} strokeWidth={1.5} absoluteStrokeWidth />
          {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
        </button>}
        {onOpenTranslator && (
          <button
            className={`icon-button island-translate-button${page === "translation" ? " island-translate-button--active" : ""}`}
            type="button"
            aria-label={features.translation ? withShortcut(t.translator.title, "translation") : t.translator.title}
            aria-pressed={features.translation ? page === "translation" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTranslator();
            }}
          >
            <Languages size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        )}
        <button
          className={`icon-button island-reset-button${
            isDetached ? " island-reset-button--available" : ""
          }`}
          type="button"
          aria-label={t.island.resetPositionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onResetPosition();
          }}
        >
          <RotateCcw size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={minimizesToTray ? t.island.minimizeToTray : t.island.tuckToTop}
          onClick={(event) => {
            event.stopPropagation();
            onMinimize();
          }}
        >
          <Minus size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
    </header>
  );
}
