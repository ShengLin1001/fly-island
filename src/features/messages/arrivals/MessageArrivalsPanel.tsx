import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "../../../i18n";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { ArrivalMediaControls, type ArrivalMedia } from "./ArrivalMediaControls";
import { messagePreviewText } from "../messagePreview";
import { bannerClock } from "../banner/bannerMessages";
import { arrivalKey, type ArrivalMessage } from "./messageArrivals";
import "./MessageArrivalsPanel.css";

/**
 * The Messages page while it opened by itself for new messages (roadmap C11): only what arrived
 * since, newest first. A row does what clicking the one-line preview does; plugin rows carry
 * their buttons. Reports its height so the island fits it. Shown as a popup without the island's
 * header (C11b), so its title row carries the way to the whole Messages page. A plugin message
 * that asked for the inline layout, alone in the popup, drops the title row and the card: the
 * island is the message (C11c); a press beside it still opens the whole page. One that asked for
 * the player's buttons shows them where its time would be.
 */
export function MessageArrivalsPanel({
  arrivals,
  onOpen,
  onAction,
  onMeasure,
  onShowAll,
  media,
}: {
  arrivals: readonly ArrivalMessage[];
  onOpen: (message: ArrivalMessage) => void;
  onAction: (message: ArrivalMessage, action: string) => void;
  onMeasure: (height: number) => void;
  onShowAll: () => void;
  /** The player, for messages that asked for its buttons; without it they show none. */
  media?: ArrivalMedia;
}) {
  const t = useTranslation().messages;
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => onMeasure(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onMeasure]);

  const inline = arrivals.length === 1 && arrivals[0].inline === true;
  return (
    <section className={`message-arrivals${inline ? " message-arrivals--inline" : ""}`} ref={ref} aria-label={t.arrivals.title}>
      {!inline && (
        <div className="message-arrivals__top">
          <h2 className="message-arrivals__title">{t.arrivals.title}</h2>
          <button className="message-arrivals__all" type="button" onClick={onShowAll}>
            {t.arrivals.showAll}
            <ChevronRight size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        </div>
      )}
      <ul className="message-arrivals__list">
        {arrivals.map((message) => {
          const plainWeChat = message.source === "wechat" && !message.chat;
          const title = plainWeChat ? t.wechat : message.title.trim() || (message.source === "qq" ? "QQ" : t.sourceLabels[message.source]);
          const body = plainWeChat ? t.wechatPreview
            : message.source === "qqMail" ? message.body.trim() || t.newMail
              : message.source === "plugin" ? message.body.trim() : message.body.trim() || t.newMessage;
          const controls = message.mediaControls && media ? media : null;
          return (
            <li className={`message-arrivals__item${controls ? " message-arrivals__item--media" : ""}`} key={arrivalKey(message)}>
              <button
                className="message-arrivals__row"
                type="button"
                aria-label={t.openPreview(messagePreviewText(message, t), t.sourceLabels[message.source])}
                onClick={() => onOpen(message)}
              >
                <MessageSourceIcon source={message.source} size={inline ? 32 : 20} account={message.account} iconUrl={message.iconUrl} />
                <span className="message-arrivals__text">
                  <span className="message-arrivals__head">
                    <strong className="message-arrivals__sender">{title}</strong>
                    {!controls && <time className="message-arrivals__time" dateTime={new Date(message.receivedAt).toISOString()}>{bannerClock(message.receivedAt)}</time>}
                  </span>
                  {body && <span className="message-arrivals__body">{body}</span>}
                </span>
              </button>
              {controls && <ArrivalMediaControls media={controls} />}
              {message.actions.length > 0 && (
                <div className="message-arrivals__actions" role="group" aria-label={t.banner.actions}>
                  {message.actions.map((action) => (
                    <button className="message-arrivals__action" type="button" key={action.id} onClick={() => onAction(message, action.id)}>
                      {action.title}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
