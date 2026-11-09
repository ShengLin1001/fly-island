// The calendar page's month view and day list: which days a month shows, which events fall on a
// day, and the marks a holiday calendar puts on it.
import type { CalendarEvent } from "./api";
import { CHINESE_DAY_NAMES, chineseDay } from "./lunar.ts";

const DAY_MS = 86_400_000;

/** Local midnight of the day `ms` falls on. */
export function startOfDay(ms: number) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight of the day after `dayStart` (not always 24 hours on, across a DST change). */
export function nextDay(dayStart: number) {
  const date = new Date(dayStart);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

/** Local midnight on the 1st of the month `ms` falls in, moved by `months`. */
export function monthStart(ms: number, months = 0) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth() + months, 1).getTime();
}

/** The six weeks the month of `month` is shown in, Monday first: 42 local midnights. */
export function monthDays(month: number) {
  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + index).getTime());
}

/** The events on the local day starting `dayStart`, by start: any part of them falls in it. */
export function eventsOn(events: readonly CalendarEvent[], dayStart: number) {
  const end = nextDay(dayStart);
  return events.filter((event) => event.startMs < end && (event.endMs > dayStart || (event.endMs === event.startMs && event.startMs >= dayStart)));
}

/** A holiday calendar's mark on a day: "off" for a day off (休), "work" for a make-up workday (班). */
export type DayMark = "off" | "work";

const OFF = /[（(]休[)）]\s*$/u;
const WORK = /[（(]班[)）]\s*$/u;
const LUNAR_DATE_TITLE = /^(?:闰)?[正二三四五六七八九十冬腊]月(?:初|十|廿|二十|三十)/u;

/** What a holiday calendar marks the day's events say, or null. A make-up workday wins over a day off. */
export function dayMark(events: readonly CalendarEvent[]): DayMark | null {
  const allDay = events.filter((event) => event.allDay);
  if (allDay.some((event) => WORK.test(event.title))) return "work";
  if (allDay.some((event) => OFF.test(event.title))) return "off";
  return null;
}

/**
 * Whether an event only names the day, as a holiday calendar's entries do ("立冬", "春节（休）",
 * "正月初二"): the month view shows those as its own label or mark, not as an event dot.
 */
export function namesTheDay(event: CalendarEvent) {
  if (!event.allDay) return false;
  const title = event.title.trim();
  return OFF.test(title) || WORK.test(title) || LUNAR_DATE_TITLE.test(title)
    || CHINESE_DAY_NAMES.has(title) || CHINESE_DAY_NAMES.has(title.replace(/节$/u, "")) || CHINESE_DAY_NAMES.has(`${title}节`);
}

/** The next festival or solar term after the day `from`, within `withinDays`: its name and how many days on. */
export function nextSpecialDay(from: number, withinDays = 31) {
  let day = startOfDay(from);
  for (let ahead = 1; ahead <= withinDays; ahead++) {
    day = nextDay(day);
    const { festival, term } = chineseDay(new Date(day));
    const name = festival ?? term;
    if (name) return { name, days: ahead };
  }
  return null;
}

/** Whether the day starting `dayStart` lies in the time the events were read for. */
export function isRead(snapshot: { fromMs: number; toMs: number }, dayStart: number) {
  return snapshot.toMs > snapshot.fromMs && dayStart >= snapshot.fromMs && dayStart + DAY_MS / 2 < snapshot.toMs;
}
