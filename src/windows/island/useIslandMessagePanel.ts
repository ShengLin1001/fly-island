import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { addArrival, removeArrival, arrivalKey, type ArrivalMessage } from "../../features/messages/arrivals/messageArrivals";
import type { MailMessage } from "../../features/messages/mail/api";
import type { MessageSource } from "../../features/messages/messagePreview";
import { runPluginNotificationAction } from "../../features/plugins/api";
import type { useIslandNotices } from "./useIslandNotices";
import type { IslandMode, IslandPage } from "./types";
import { useOutsideClick } from "./useOutsideClick";

/** While the cursor rests on the island (it holds the focus then), closing waits this long more. */
const HOVER_RETRY_MS = 1000;

/** A row and what opening it needs: the mail it names, or the plugin that sent it. */
export type PanelArrival = ArrivalMessage & { mail?: { message: MailMessage; account: string | null }; pluginId?: string };

type PanelNotices = Pick<ReturnType<typeof useIslandNotices>, "preview" | "qqNotifications" | "wechatReminders" | "qqMail" | "pluginNotifications" | "setMessagePanelOpen">;

type MessagePanelOptions = {
  enabled: boolean;
  durationMs: number;
  notices: PanelNotices;
  mode: IslandMode;
  page: IslandPage;
  openIslandPage: (page: IslandPage) => void;
  collapseIsland: () => void;
  onOpenMessages: (source: MessageSource) => void;
};

/**
 * The third way new messages show (roadmap C11), like the Agent page's alert: the collapsed island
 * opens on the Messages page with only what arrived, newest first, and closes again after
 * `durationMs`. Resting the cursor on it holds it; a press inside means the user took it over and
 * it no longer closes by itself, and a press outside the rows brings back the whole page. Messages
 * arriving while it shows join it; with the island opened by the user, none of this happens.
 */
export function useIslandMessagePanel({ enabled, durationMs, notices, mode, page, openIslandPage, collapseIsland, onOpenMessages }: MessagePanelOptions) {
  const { preview, qqNotifications, wechatReminders, qqMail, pluginNotifications, setMessagePanelOpen } = notices;
  const [arrivals, setArrivals] = useState<PanelArrival[] | null>(null);
  const [height, setHeight] = useState(0);
  const autoOpenedRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const handledKeyRef = useRef<string | null>(null);
  const isOnMessages = mode === "expanded" && page === "qq";
  const latest = useRef({ mode, isOnMessages, durationMs, collapseIsland, openIslandPage });
  useLayoutEffect(() => {
    latest.current = { mode, isOnMessages, durationMs, collapseIsland, openIslandPage };
  });

  const end = useCallback(() => {
    autoOpenedRef.current = false;
    window.clearTimeout(closeTimerRef.current);
    setArrivals(null);
    setMessagePanelOpen(false);
  }, [setMessagePanelOpen]);

  const close = useCallback(() => {
    const wasOpen = latest.current.isOnMessages;
    end();
    if (wasOpen) latest.current.collapseIsland();
  }, [end]);

  // A new arrival: open the panel, or join the one this opened.
  const incoming = enabled && preview ? toArrival(preview, notices) : null;
  const incomingKey = incoming ? `${arrivalKey(incoming)}:${incoming.receivedAt}` : null;
  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;
  useEffect(() => {
    const message = incomingRef.current;
    if (!message || !incomingKey || handledKeyRef.current === incomingKey) return;
    handledKeyRef.current = incomingKey;
    const current = latest.current;
    if (current.mode !== "collapsed" && !autoOpenedRef.current) return;
    setArrivals((list) => addArrival(list ?? [], message));
    setMessagePanelOpen(true);
    autoOpenedRef.current = true;
    if (current.mode === "collapsed") current.openIslandPage("qq");
    const closeLater = () => {
      if (!autoOpenedRef.current) return;
      if (document.hasFocus()) {
        closeTimerRef.current = window.setTimeout(closeLater, HOVER_RETRY_MS);
        return;
      }
      close();
    };
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(closeLater, current.durationMs);
  }, [incomingKey, close, setMessagePanelOpen]);

  // A press inside is the user taking the panel over; outside the rows it is the whole page again.
  const showing = arrivals !== null;
  useEffect(() => {
    if (!showing) return;
    const takeOver = (event: PointerEvent) => {
      autoOpenedRef.current = false;
      window.clearTimeout(closeTimerRef.current);
      if (!(event.target instanceof Element && event.target.closest(".message-arrivals"))) {
        setArrivals(null);
        setMessagePanelOpen(false);
      }
    };
    window.addEventListener("pointerdown", takeOver, true);
    return () => window.removeEventListener("pointerdown", takeOver, true);
  }, [showing, setMessagePanelOpen]);

  // Collapsing, or moving to another page (an Agent card, say), ends it. Not while collapsed:
  // the panel sets its rows just before the island opens.
  const wasExpandedRef = useRef(mode === "expanded");
  useEffect(() => {
    const collapsedNow = mode === "collapsed" && wasExpandedRef.current;
    wasExpandedRef.current = mode === "expanded";
    if (showing && (collapsedNow || (mode === "expanded" && page !== "qq"))) end();
  }, [mode, page, showing, end]);
  useEffect(() => {
    if (!enabled && showing) close();
  }, [enabled, showing, close]);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useOutsideClick(showing && isOnMessages, close);

  const open = useCallback((message: PanelArrival) => {
    if (message.source === "plugin") {
      pluginNotifications.dismiss();
      const rest = removeArrival(arrivals ?? [], arrivalKey(message));
      if (rest.length === 0) close();
      else setArrivals(rest);
      return;
    }
    end();
    if (message.source === "qqMail" && message.mail) {
      onOpenMessages("qqMail");
      void qqMail.readMail(message.mail.message, message.mail.account);
      return;
    }
    const source = message.source;
    const launch = source === "qq" ? qqNotifications.openQQ : wechatReminders.openWeChat;
    void launch().then((opened) => {
      if (opened === false) onOpenMessages(source);
      else latest.current.collapseIsland();
    });
  }, [arrivals, close, end, onOpenMessages, pluginNotifications, qqMail, qqNotifications, wechatReminders]);

  const runAction = useCallback((message: PanelArrival, action: string) => {
    if (message.pluginId) {
      void runPluginNotificationAction(message.pluginId, action).catch((error: unknown) =>
        console.error("Failed to run a plugin notification action", error),
      );
    }
    pluginNotifications.dismiss();
    const rest = removeArrival(arrivals ?? [], arrivalKey(message));
    if (rest.length === 0) close();
    else setArrivals(rest);
  }, [arrivals, close, pluginNotifications]);

  return {
    /** The rows while the page shows only the new messages, else null. */
    arrivals: showing && page === "qq" ? arrivals : null,
    /** The rows' measured height, for the island's height. */
    height,
    measure: setHeight,
    open,
    runAction,
  };
}

/** The panel row for the newest preview, with what opening it needs. */
function toArrival(preview: NonNullable<PanelNotices["preview"]>, notices: PanelNotices): PanelArrival {
  const base: PanelArrival = { ...preview, actions: [] };
  const { qqMail, pluginNotifications } = notices;
  if (preview.source === "qqMail" && qqMail.preview) {
    return { ...base, mail: { message: qqMail.preview, account: qqMail.previewAccount } };
  }
  const notification = pluginNotifications.notification;
  if (preview.source === "plugin" && notification) {
    return { ...base, actions: notification.actions, pluginId: notification.pluginId };
  }
  return base;
}
