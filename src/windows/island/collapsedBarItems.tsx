import type { ReactNode } from "react";
import { CircleArrowUp, Inbox } from "lucide-react";
import type { MediaState } from "../../features/media/api";
import { MessageSourceIcon } from "../../features/messages/MessageSourceIcon";
import { MusicWaveButton } from "../../features/media/MusicWaveButton";
import type { DeviceUse } from "../../features/device-use/api";
import { DeviceUseIndicator } from "../../features/device-use/DeviceUseIndicator";
import type { MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { Translations } from "../../i18n";
import { openSettingsWindow } from "../settings/api";
import type { CollapsedSlots, IslandPage } from "./types";

/** The icons that stay on the collapsed bar, each with an id the ordering will refer to (docs/architecture/collapsed-bar-items.md). */
export type CollapsedBarItemId = "mail" | "update" | "plugin-status" | "device-use" | "shelf" | "music" | "gauges" | "session-count";

export type CollapsedBarItem = { id: CollapsedBarItemId; node: ReactNode };

type CollapsedBarItemsInput = {
  t: Translations;
  qqMail: MailController;
  updateVersion: string | null;
  /** The plugin status chip, or null while something else takes the summary's place. */
  pluginStatus: ReactNode;
  deviceUse: DeviceUse;
  shelfCount: number | null;
  showMusic: boolean;
  mediaState: MediaState;
  agentSessionCount: number | null;
  slots: CollapsedSlots;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
};

/** The bar's icons right of the summary, in the order they show; empty ones are left out. */
export function collapsedBarItems({
  t,
  qqMail,
  updateVersion,
  pluginStatus,
  deviceUse,
  shelfCount,
  showMusic,
  mediaState,
  agentSessionCount,
  slots,
  onOpenPage,
  onOpenMessages,
}: CollapsedBarItemsInput): CollapsedBarItem[] {
  const items: CollapsedBarItem[] = [];
  if (qqMail.preview !== null) {
    items.push({
      id: "mail",
      node: (
        <button className="island-message-button island-message-button--compact qq-mail-badge" type="button" aria-label={t.messages.newMailLabel} onClick={() => onOpenMessages("qqMail")}>
          <MessageSourceIcon source="qqMail" size={16} />
          <span className="island-message-button__dot" aria-hidden="true" />
        </button>
      ),
    });
  }
  if (updateVersion) {
    items.push({
      id: "update",
      node: (
        <button
          className="island-message-button island-message-button--compact island-update-badge"
          type="button"
          aria-label={t.settings.project.update.islandReminder(updateVersion)}
          onClick={(event) => {
            event.stopPropagation();
            openSettingsWindow("updates");
          }}
        >
          <CircleArrowUp size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span className="island-message-button__dot island-update-badge__dot" aria-hidden="true" />
        </button>
      ),
    });
  }
  if (pluginStatus) items.push({ id: "plugin-status", node: pluginStatus });
  items.push({ id: "device-use", node: <DeviceUseIndicator deviceUse={deviceUse} /> });
  if (shelfCount !== null && shelfCount > 0) {
    items.push({
      id: "shelf",
      node: (
        <button className="island-shelf-count" type="button" aria-label={t.island.shelfCount(shelfCount)} onClick={() => onOpenPage("shelf")}>
          <Inbox size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span>{shelfCount}</span>
        </button>
      ),
    });
  }
  if (showMusic) {
    items.push({
      id: "music",
      node: (
        <MusicWaveButton
          isAvailable={mediaState.available || mediaState.audioActive}
          isPlaying={mediaState.playbackStatus === "playing"}
          audioPeak={mediaState.audioPeak}
          label={t.island.openMusic}
          onClick={() => onOpenPage("music")}
        />
      ),
    });
  }
  if (slots.gauges) items.push({ id: "gauges", node: <div className="island__gauge-slot">{slots.gauges}</div> });
  if (agentSessionCount !== null) {
    if (slots.agentCount) {
      items.push({ id: "session-count", node: slots.agentCount });
    } else if (agentSessionCount > 0) {
      items.push({
        id: "session-count",
        node: (
          <button
            className="island-agent-count"
            type="button"
            aria-label={t.agent.sessions.activeCount(agentSessionCount)}
            onClick={(event) => {
              event.stopPropagation();
              onOpenPage("agents");
            }}
          >
            {agentSessionCount}
          </button>
        ),
      });
    }
  }
  return items;
}
