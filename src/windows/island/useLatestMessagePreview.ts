import { useState } from "react";
import { latestMessagePreview } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import type { PluginNotificationsController } from "../../features/plugins/usePluginNotifications";
import { useTranslation } from "../../i18n";
/** The newest message preview of all sources; one that a newer preview replaced does not come back. */
export function useLatestMessagePreview(
  qqNotifications: QQNotificationsController,
  wechatReminders: WeChatRemindersController,
  qqMail: MailController,
  pluginNotifications: PluginNotificationsController,
) {
  const t = useTranslation();
  const qqPreview = qqNotifications.preview;
  const wechatPreviewAt = wechatReminders.previewReceivedAt;
  const pluginNotification = pluginNotifications.notification;
  const [latestPreviewAt, setLatestPreviewAt] = useState(0);
  const preview = latestMessagePreview([
    qqPreview ? { ...qqPreview, source: "qq", receivedAt: qqNotifications.previewReceivedAt ?? 0 } : null,
    wechatPreviewAt !== null ? { source: "wechat", title: t.messages.wechat, body: t.messages.newReminder, receivedAt: wechatPreviewAt } : null,
    qqMail.preview ? { source: "qqMail", title: qqMail.preview.sender, body: qqMail.preview.subject, receivedAt: qqMail.previewReceivedAt ?? 0, account: qqMail.previewAccount } : null,
    pluginNotification ? {
      source: "plugin", title: pluginNotification.title, body: pluginNotification.body, receivedAt: pluginNotification.receivedAt,
      iconUrl: pluginNotification.iconUrl ?? null, inline: pluginNotification.layout === "inline", mediaControls: pluginNotification.controls === "media",
    } : null,
  ], latestPreviewAt);
  if (preview && preview.receivedAt > latestPreviewAt) setLatestPreviewAt(preview.receivedAt);
  return preview;
}
