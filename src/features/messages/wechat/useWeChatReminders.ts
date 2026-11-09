import { useTranslation } from "../../../i18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { launchWeChat, listenWeChatReminderChanged, setWeChatRemindersEnabled, type ChatMessage, type ReminderSnapshot } from "./api";
import { isWeChatRemindersEnabled, saveWeChatRemindersEnabled } from "./storage";

const EMPTY_SNAPSHOT: ReminderSnapshot = {
  revision: 0, enabled: false, status: "disabled", pending: false,
  lastAttentionAt: null, error: null, message: null,
};

export function useWeChatReminders(canPreview: boolean) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [busy, setBusy] = useState(isTauri);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewReceivedAt, setPreviewReceivedAt] = useState<number | null>(null);
  /** The chat message the preview shows; null for the plain "new reminder". */
  const [previewMessage, setPreviewMessage] = useState<ChatMessage | null>(null);
  const canPreviewRef = useRef(canPreview);
  const revisionRef = useRef(-1);
  const attentionRef = useRef<number | null>(null);
  const messageAtRef = useRef<number | null>(null);
  const actionPending = useRef(false);

  useLayoutEffect(() => {
    canPreviewRef.current = canPreview;
    if (!canPreview) setPreviewReceivedAt(null);
  }, [canPreview]);

  const acceptSnapshot = useCallback((next: ReminderSnapshot) => {
    if (next.revision < revisionRef.current) return false;
    revisionRef.current = next.revision;
    attentionRef.current = next.lastAttentionAt;
    messageAtRef.current = next.message?.at ?? null;
    setSnapshot(next);
    return true;
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenWeChatReminderChanged(({ payload }) => {
        const newlyPending = payload.snapshot.pending
          && payload.snapshot.lastAttentionAt !== attentionRef.current;
        // Each message read from the chat list is its own preview, pending or not.
        const message = payload.snapshot.message;
        const newMessage = message !== null && message.at !== messageAtRef.current;
        if (cancelled || !acceptSnapshot(payload.snapshot)) return;
        if (!payload.snapshot.enabled || !payload.snapshot.pending
          || payload.snapshot.status !== "listening" || !payload.windowVisible || !canPreviewRef.current) {
          setPreviewReceivedAt(null);
        } else if (newMessage) {
          setPreviewMessage(message);
          setPreviewReceivedAt(message.at);
        } else if (newlyPending) {
          setPreviewMessage(null);
          setPreviewReceivedAt(Date.now());
        }
      });
      if (cancelled) { unlisten(); return; }
      const next = await setWeChatRemindersEnabled(
        isWeChatRemindersEnabled(),
      );
      if (!cancelled) acceptSnapshot(next);
    })().catch((error: unknown) => {
      if (!cancelled) setActionError(String(error));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [acceptSnapshot]);

  useEffect(() => {
    if (previewReceivedAt === null) return;
    const timer = window.setTimeout(() => setPreviewReceivedAt(null),
      Math.max(0, previewReceivedAt + 5_000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewReceivedAt]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (actionPending.current) return;
    if (!isTauri()) {
      setActionError(t.wechat.desktopOnly);
      return false;
    }
    actionPending.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(String(error));
      return false;
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }, [t]);

  const setEnabled = useCallback((enabled: boolean) => run(async () => {
    acceptSnapshot(await setWeChatRemindersEnabled(enabled));
    saveWeChatRemindersEnabled(enabled);
    if (!enabled) setPreviewReceivedAt(null);
  }), [acceptSnapshot, run]);

  /** Brings WeChat up; `chat` (a preview's) also opens that chat. */
  const openWeChat = useCallback((chat?: string | null) => run(async () => {
    await launchWeChat(chat);
    setPreviewReceivedAt(null);
  }), [run]);

  const showing = canPreview && snapshot.pending && previewReceivedAt !== null;
  return {
    snapshot, busy, actionError, setEnabled, openWeChat,
    previewReceivedAt: showing ? previewReceivedAt : null,
    previewMessage: showing ? previewMessage : null,
  };
}

export type WeChatRemindersController = ReturnType<typeof useWeChatReminders>;
