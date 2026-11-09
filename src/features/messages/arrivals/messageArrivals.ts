import type { MessagePreview } from "../messagePreview";

/** At most this many rows; older arrivals are still on the full Messages page. */
export const MAX_ARRIVALS = 6;

/** One row of the panel new messages open (roadmap C11). */
export type ArrivalMessage = MessagePreview & {
  /** A plugin notification's buttons; empty for the other sources. */
  actions: { id: string; title: string }[];
};

/**
 * Identifies one arrival. WeChat's plain reminder has a single row, since it only says that
 * something came; a WeChat message read from its chat list is a row of its own, as in QQ.
 */
export function arrivalKey(message: MessagePreview): string {
  return message.source === "wechat" && !message.chat ? "wechat" : `${message.source}:${message.receivedAt}`;
}

/** A message arriving: it goes on top; the same arrival seen again leaves the list as it is. */
export function addArrival<T extends ArrivalMessage>(list: readonly T[], message: T): T[] {
  const key = arrivalKey(message);
  const index = list.findIndex((item) => arrivalKey(item) === key);
  if (index >= 0 && list[index].receivedAt === message.receivedAt) return list as T[];
  return [message, ...list.filter((item) => arrivalKey(item) !== key)].slice(0, MAX_ARRIVALS);
}

export function removeArrival<T extends ArrivalMessage>(list: readonly T[], key: string): T[] {
  return list.filter((item) => arrivalKey(item) !== key);
}
