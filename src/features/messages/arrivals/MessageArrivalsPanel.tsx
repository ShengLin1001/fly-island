import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "../../../i18n";
import { MessageSourceIcon } from "../MessageSourceIcon";
import { messagePreviewText } from "../messagePreview";
import { bannerClock } from "../banner/bannerMessages";
import { arrivalKey, type ArrivalMessage } from "./messageArrivals";
import "./MessageArrivalsPanel.css";

/**
 * The Messages page while it opened by itself for new messages (roadmap C11): only what arrived
 * since, newest first. A row does what clicking the one-line preview does; plugin rows carry
 * their buttons. Reports its height so the island fits it.
 */
export function MessageArrivalsPanel({
  arrivals,
  onOpen,
  onAction,
  onMeasure,
}: {
  arrivals: readonly ArrivalMessage[];
  onOpen: (message: ArrivalMessage) => void;
  onAction: (message: ArrivalMessage, action: string) => void;
  onMeasure: (height: number) => void;
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

  return (
    <section className="message-arrivals" ref={ref} aria-label={t.arrivals.title}>
      <h2 className="message-arrivals__title">{t.arrivals.title}</h2>
      <ul className="message-arrivals__list">
        {arrivals.map((message) => {
          const title = message.source === "wechat" ? t.wechat : message.title.trim() || (message.source === "qq" ? "QQ" : t.sourceLabels[message.source]);
          const body = message.source === "wechat" ? t.wechatPreview
            : message.source === "qqMail" ? message.body.trim() || t.newMail
              : message.source === "plugin" ? message.body.trim() : message.body.trim() || t.newMessage;
          return (
            <li className="message-arrivals__item" key={arrivalKey(message)}>
              <button
                className="message-arrivals__row"
                type="button"
                aria-label={t.openPreview(messagePreviewText(message, t), t.sourceLabels[message.source])}
                onClick={() => onOpen(message)}
              >
                <MessageSourceIcon source={message.source} size={20} />
                <span className="message-arrivals__text">
                  <span className="message-arrivals__head">
                    <strong className="message-arrivals__sender">{title}</strong>
                    <time className="message-arrivals__time" dateTime={new Date(message.receivedAt).toISOString()}>{bannerClock(message.receivedAt)}</time>
                  </span>
                  {body && <span className="message-arrivals__body">{body}</span>}
                </span>
              </button>
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
