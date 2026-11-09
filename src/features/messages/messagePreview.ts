import zhCN from "../../i18n/locales/zh-CN.ts";
import type { Translations } from "../../i18n/types";

export type MessageSource = "qq" | "wechat" | "qqMail";
/** Where a collapsed preview comes from: a message source, or a plugin's island.notify. */
export type PreviewSource = MessageSource | "plugin";

export type MessagePreview = {
  source: PreviewSource;
  title: string;
  body: string;
  receivedAt: number;
  /** The mailbox a mail preview came from, which picks the mail icon. */
  account?: string | null;
  /** A plugin message's own icon (island.notify `icon: "media"`), as a data URL. */
  iconUrl?: string | null;
  /** A plugin message that, alone in the new-messages popup, shows without a title row or card. */
  inline?: boolean;
  /** A plugin message with the island's previous / play-pause / next beside it (island.notify `controls: "media"`). */
  mediaControls?: boolean;
  /** The WeChat chat a preview read from WeChat's chat list came from, which clicking it opens. */
  chat?: string | null;
};

export const MESSAGE_SOURCE_LABELS: Record<MessageSource, string> = zhCN.messages.sourceLabels;

export function messagePreviewText(preview: MessagePreview, copy: Translations["messages"] = zhCN.messages): string {
  if (preview.source === "wechat" && preview.chat) return copy.qqPreview(preview.title, preview.body);
  if (preview.source === "wechat") return copy.wechatPreview;
  if (preview.source === "qqMail") return preview.body.trim() || copy.newMail;
  if (preview.source === "plugin") return preview.body.trim() ? copy.qqPreview(preview.title, preview.body.trim()) : preview.title;
  return copy.qqPreview(preview.title.trim() || "QQ", preview.body.trim() || copy.newMessage);
}

export function latestMessagePreview(candidates: (MessagePreview | null)[], latestReceivedAt = -Infinity): MessagePreview | null {
  return candidates.reduce<MessagePreview | null>(
    (latest, candidate) => candidate && candidate.receivedAt >= latestReceivedAt
      && (!latest || candidate.receivedAt > latest.receivedAt) ? candidate : latest,
    null,
  );
}

export function mailBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
