import { Fragment, type ReactNode } from "react";
import { Bot, Music2 } from "lucide-react";
import { AgentProviderIcon } from "../../features/agent-status/AgentProviderIcon";
import type { QuotaAlert } from "../../features/agent-status/quotaAlerts";
import { QuotaAlertPopup } from "../../features/agent-status/QuotaAlertPopup";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MediaState } from "../../features/media/api";
import type { CurrentLyric } from "../../features/media/lyrics/useCurrentLyric";
import { CollapsedMessageContent } from "../../features/messages/CollapsedMessageContent";
// After CollapsedMessageContent, matching the original stylesheet order: it brings the
// message icon, music wave and device-use styles in that order.
import { collapsedBarItems, type CollapsedBarItem } from "./collapsedBarItems";
import type { DeviceUse } from "../../features/device-use/api";
import type { LevelChange } from "../../features/system-levels/api";
import { LevelPopup } from "../../features/system-levels/LevelPopup";
import type { DeviceAlert } from "../../features/device-events/api";
import { DeviceAlertPopup } from "../../features/device-events/DeviceAlertPopup";
import { MeetingLine } from "../../features/calendar/MeetingLine";
import { openMeetingLink } from "../../features/calendar/api";
import type { CollapsedMeeting } from "../../features/calendar/upcoming";
import { messagePreviewText, type MessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { PluginNotificationActions } from "../../features/plugins/PluginNotificationActions";
import type { PluginNotificationsController } from "../../features/plugins/usePluginNotifications";
import { useUpdateReminder } from "../../features/updater/useBackgroundUpdateCheck";
import { arrangeCollapsedItems, zoneIds, type CollapsedZone } from "../../features/appearance/collapsedItems";
import { useCollapsedPlacements } from "../../features/appearance/useCollapsedPlacements";
import type { PluginViewEntry } from "../../features/plugin-views/api";
import { usePluginStatusItems } from "../../features/plugin-views/usePluginStatusItems";
import { useTranslation } from "../../i18n";
import type { CollapsedSlots, IslandPage } from "./types";
import { useWindowDragGesture } from "./useWindowDragGesture";
import "./IslandCollapsedBar.css";

type IslandCollapsedBarProps = {
  qqMail: MailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  pluginNotifications: PluginNotificationsController;
  preview: MessagePreview | null;
  page: IslandPage;
  isExpanded: boolean;
  isTucked: boolean;
  showTitle: boolean;
  showCollapsedText: boolean;
  collapsedLabel: string;
  collapsedTaskTitle: string | null;
  collapsedTodoCount: number | null;
  agentSession: AgentSession | null;
  /** The line being sung; shown while no agent is named. */
  lyricLine: CurrentLyric | null;
  /**
   * Agent sessions still working, shown where the tuck dot was; null while the AI Agent switch
   * is off, which keeps the tuck dot.
   */
  agentSessionCount: number | null;
  mediaState: MediaState;
  /** False while music is switched off, which hides the waveform button. */
  showMusic: boolean;
  /** Files on the shelf, or null when the count is not shown. */
  shelfCount: number | null;
  /** Apps using the camera and microphone; their icons show while any do. */
  deviceUse: DeviceUse;
  /** A volume or brightness change just made; it takes the place of the text while shown. */
  levelPopup: LevelChange | null;
  /** Headphones connecting, a battery running low or the charger; it comes before the level popup. */
  deviceAlert: DeviceAlert | null;
  /** Claude's or Codex's usage reaching the alert level, or resetting; shown like a device alert, after it. */
  quotaAlert?: QuotaAlert | null;
  /** A meeting about to start; it takes the summary's place, after alerts and translation. */
  meeting: CollapsedMeeting | null;
  agentVisualState: AgentVisualState;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Quick translation line; it takes the place of the agent or todo text while shown. */
  translationPeek: string | null;
  onOpenTranslationPeek: () => void;
  onWindowDragStart: () => void;
  onTuck: () => void;
  /** The plugin pages on the island, so a plugin status opens its plugin's page; plugin statuses wait while a message preview or a translation line shows. */
  pluginViews?: readonly PluginViewEntry[];
  onOpenPluginPage?: (page: `plugin:${string}`) => void;
  /** Built-in plugins' centre, gauge and session-count slots. */
  slots?: CollapsedSlots;
};

const NO_SLOTS: CollapsedSlots = {};
const NO_VIEWS: readonly PluginViewEntry[] = [];
const ignorePage = () => {};
/** Clicking an item marked with it does what a click on the bar's empty space does. */
const OPENS_BAR = "data-opens-bar";

/** The items of one zone; neighbours of one group share a wrapper. */
function renderZone(items: readonly CollapsedBarItem[]) {
  const out: ReactNode[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.group) {
      out.push(<Fragment key={item.id}>{item.node}</Fragment>);
      continue;
    }
    const group = [item];
    while (items[index + 1]?.group === item.group) group.push(items[(index += 1)]);
    out.push(<div key={group[0].id} className="island__gauge-slot">{group.map((member) => <Fragment key={member.id}>{member.node}</Fragment>)}</div>);
  }
  return out;
}

/** The collapsed island: agent pulse, todo or message summary, mail badge, music button and tuck handle. */
export function IslandCollapsedBar({
  qqMail,
  qqNotifications,
  wechatReminders,
  pluginNotifications,
  preview,
  page,
  isExpanded,
  isTucked,
  showTitle,
  showCollapsedText,
  collapsedLabel,
  collapsedTaskTitle,
  collapsedTodoCount,
  agentSession,
  lyricLine,
  agentSessionCount,
  mediaState,
  showMusic,
  shelfCount,
  deviceUse,
  levelPopup,
  deviceAlert,
  quotaAlert = null,
  meeting,
  agentVisualState,
  onOpenPage,
  onOpenMessages,
  translationPeek,
  onOpenTranslationPeek,
  onWindowDragStart,
  onTuck,
  pluginViews = NO_VIEWS,
  onOpenPluginPage = ignorePage,
  slots = NO_SLOTS,
}: IslandCollapsedBarProps) {
  const t = useTranslation();
  // A newer version found by the background check, unless the user skipped it.
  const updateVersion = useUpdateReminder();
  const { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag } =
    useWindowDragGesture(isTucked, onWindowDragStart);
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  // While the island names a running agent, opening it shows the Agent page.
  // While the island names a meeting or a running agent, opening it shows that page.
  const showMeeting = showCollapsedText && meeting !== null;
  const openTarget: IslandPage = showMeeting ? "calendar" : agentSession ? "agents" : lyricLine ? "music" : page;
  const lyric = !agentSession && lyricLine?.text ? lyricLine : null;
  // The centre slot takes the summary's place while the bar has no summary.
  const showCenter = Boolean(slots.center) && !preview && !translationPeek
    && !(showCollapsedText && (showTitle || agentSession !== null || lyric !== null || collapsedTaskTitle !== null || collapsedTodoCount !== null));
  const pluginStatus = usePluginStatusItems(pluginViews, onOpenPluginPage);
  const { placements: saved } = useCollapsedPlacements();
  const items = collapsedBarItems({
    t,
    statusLight: <span className={pulseClassName} {...{ [OPENS_BAR]: "" }} />,
    qqMail,
    updateVersion,
    pluginStatus: showCollapsedText && !preview && !translationPeek && !levelPopup && !deviceAlert && !quotaAlert ? pluginStatus : [],
    deviceUse,
    shelfCount,
    showMusic,
    mediaState,
    agentSessionCount,
    slots,
    onOpenPage,
    onOpenMessages,
  });
  const offered = items.map(({ id }) => id);
  const placements = arrangeCollapsedItems(offered, saved);
  const byId = new Map(items.map((item) => [item.id, item]));
  const zone = (name: CollapsedZone) => zoneIds(placements, name, offered).flatMap((id) => byId.get(id) ?? []);

  return (
    <div
      className="island__collapsed"
      aria-hidden={isExpanded}
      inert={isExpanded}
      onClick={(event) => {
        if (event.target === event.currentTarget || (event.target instanceof Element && event.target.hasAttribute(OPENS_BAR))) {
          if (translationPeek && !preview) onOpenTranslationPeek();
          else onOpenPage(openTarget);
        }
      }}
    >
      {renderZone(zone("left"))}
      <button
        className={`island__open-button${showCenter ? " island__open-button--center" : ""}`}
        type="button"
        aria-label={preview
          ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source])
          : translationPeek ? t.translator.peekLabel(translationPeek) : t.messages.expand(collapsedLabel)}
        aria-expanded={preview || translationPeek ? undefined : isExpanded}
        aria-controls={preview || translationPeek ? undefined : "island-panel"}
        onPointerDown={prepareWindowDrag}
        onPointerMove={handleWindowDragMove}
        onPointerUp={cancelWindowDrag}
        onPointerCancel={cancelWindowDrag}
        onClick={(event) => {
          if (event.detail === 0 || !didDragRef.current) {
            if (preview) {
              const source = preview.source;
              if (source === "plugin") {
                pluginNotifications.dismiss();
                return;
              }
              if (source === "qqMail" && qqMail.preview) {
                onOpenMessages("qqMail");
                void qqMail.readMail(qqMail.preview, qqMail.previewAccount);
                return;
              }
              const open = source === "qq" ? qqNotifications.openQQ : wechatReminders.openWeChat;
              void open().then((opened) => {
                if (opened === false) onOpenMessages(source);
              });
            } else if (translationPeek) {
              onOpenTranslationPeek();
            } else {
              onOpenPage(openTarget);
            }
          }
        }}
      >
        <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked}>
          {deviceAlert ? (
            <DeviceAlertPopup alert={deviceAlert} />
          ) : quotaAlert ? (
            <QuotaAlertPopup alert={quotaAlert} />
          ) : levelPopup ? (
            <LevelPopup change={levelPopup} />
          ) : translationPeek ? (
            <span className="island__active-task" key={translationPeek}>{translationPeek}</span>
          ) : showMeeting && meeting ? (
            <MeetingLine meeting={meeting.upcoming} showTitle={meeting.showTitle} />
          ) : <>
          {showCollapsedText && showTitle && (
            <span className="island__brand">fly-island</span>
          )}
          {showCollapsedText && agentSession && (
            <span className="island__agent-session" key={`${agentSession.label}:${agentSession.title}`}>
              {showTitle && <span className="island__agent-session-separator">·</span>}
              {slots.agentIcon ?? (agentSession.provider ? (
                <AgentProviderIcon provider={agentSession.provider} size={16} />
              ) : (
                <Bot className="island__agent-session-bot" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              ))}
              <span className="island__agent-session-title">{agentSession.title}</span>
            </span>
          )}
          {showCollapsedText && lyric && (
            // Keyed by the line, so each one fades in like a new task title.
            <span className="island__agent-session island__lyric" key={`lyric:${lyric.index}`}>
              {showTitle && <span className="island__agent-session-separator">·</span>}
              <Music2 className="island__agent-session-bot" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              <span className="island__agent-session-title">{lyric.text}</span>
            </span>
          )}
          {showCollapsedText && !agentSession && !lyric && collapsedTaskTitle && (
            <span className="island__active-task" key={collapsedTaskTitle}>
              {showTitle ? "· " : ""}
              {collapsedTaskTitle}
            </span>
          )}
          {showCollapsedText && !agentSession && !lyric && !collapsedTaskTitle && collapsedTodoCount !== null && (
            <span className="island__todo-count">
              {showTitle ? "· " : ""}
              {t.island.pendingTodos(collapsedTodoCount)}
            </span>
          )}
          </>}
        </CollapsedMessageContent>
        {showCenter && <span className="island__center-slot">{slots.center}</span>}
      </button>
      {showMeeting && !preview && !deviceAlert && !quotaAlert && !levelPopup && !translationPeek && meeting?.upcoming.event.meetingLink && (
        <button
          className="island-meeting-join"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void openMeetingLink(meeting.upcoming.event.meetingLink!).catch((error: unknown) => console.error("Failed to open the meeting link", error));
          }}
        >
          {t.calendar.join}
        </button>
      )}
      {preview?.source === "plugin" && pluginNotifications.notification && (
        <PluginNotificationActions actions={pluginNotifications.notification.actions} onAction={pluginNotifications.runAction} />
      )}
      {renderZone(zone("right"))}
      {agentSessionCount === null && (
        <button
          className="island__quiet-button"
          type="button"
          aria-label={t.island.collapseIsland}
          onClick={(event) => {
            event.stopPropagation();
            onTuck();
          }}
        />
      )}
    </div>
  );
}
