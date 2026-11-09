import assert from "node:assert/strict";
import test from "node:test";
import { chineseDay, lunarDate, lunarDayName, solarTerm } from "../../src/features/calendar/lunar.ts";
import { dayMark, eventsOn, isRead, monthDays, monthStart, namesTheDay, nextSpecialDay } from "../../src/features/calendar/monthView.ts";

const day = (y, m, d) => new Date(y, m - 1, d);
const ms = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const event = (title, startMs, endMs, fields = {}) => ({ uid: title, title, startMs, endMs, allDay: false, location: null, meetingLink: null, calendar: "工作", ...fields });

test("lunar dates come from the table, including leap months and new moons just before midnight", () => {
  assert.deepEqual(lunarDate(day(2026, 11, 9)), { month: "十月", day: 1 });
  assert.deepEqual(lunarDate(day(2025, 7, 25)), { month: "闰六月", day: 1 });
  // The WebView's Intl calendar puts this Spring Festival on the 7th.
  assert.deepEqual(lunarDate(day(2027, 2, 6)), { month: "正月", day: 1 });
  assert.deepEqual(lunarDate(day(1900, 1, 31)), { month: "正月", day: 1 });
  assert.equal(lunarDate(day(1900, 1, 30)), null);
  assert.deepEqual([1, 10, 11, 20, 21, 30].map(lunarDayName), ["初一", "初十", "十一", "二十", "廿一", "三十"]);
});

test("solar terms and festivals name the day; the 1st of a lunar month shows the month", () => {
  assert.equal(solarTerm(day(2026, 11, 22)), "小雪");
  assert.equal(solarTerm(day(2026, 2, 18)), "雨水");
  assert.equal(solarTerm(day(2026, 11, 9)), null);
  assert.equal(chineseDay(day(2027, 2, 5)).label, "除夕");
  assert.equal(chineseDay(day(2027, 2, 6)).label, "春节");
  assert.deepEqual(chineseDay(day(2026, 11, 9)), { lunar: "十月初一", label: "十月", special: false, festival: null, term: null });
  assert.equal(chineseDay(day(2026, 10, 1)).label, "国庆节");
  assert.deepEqual(nextSpecialDay(ms(2026, 11, 9)), { name: "小雪", days: 13 });
});

test("a month shows six weeks from Monday", () => {
  const days = monthDays(monthStart(ms(2026, 11, 9)));
  assert.equal(days.length, 42);
  assert.equal(days[0], ms(2026, 10, 26));
  assert.equal(days[6], ms(2026, 11, 1));
  assert.equal(monthStart(ms(2026, 11, 9), 2), ms(2027, 1, 1));
  assert.equal(monthStart(ms(2026, 1, 31), -1), ms(2025, 12, 1));
});

test("events fall on every day they touch; holiday entries give marks and no dot", () => {
  const trip = event("出差", ms(2026, 11, 9, 20), ms(2026, 11, 11, 9));
  const allDay = event("假期", ms(2026, 11, 10), ms(2026, 11, 11), { allDay: true });
  const reminder = event("提醒", ms(2026, 11, 12, 9), ms(2026, 11, 12, 9));
  const events = [trip, allDay, reminder];
  assert.deepEqual(eventsOn(events, ms(2026, 11, 10)).map((e) => e.title), ["出差", "假期"]);
  assert.deepEqual(eventsOn(events, ms(2026, 11, 11)).map((e) => e.title), ["出差"]);
  assert.deepEqual(eventsOn(events, ms(2026, 11, 12)).map((e) => e.title), ["提醒"]);

  const holiday = (title) => event(title, ms(2026, 10, 1), ms(2026, 10, 2), { allDay: true });
  assert.equal(dayMark([holiday("国庆节（休）")]), "off");
  assert.equal(dayMark([holiday("国庆节（休）"), holiday("国庆节（班）")]), "work");
  assert.equal(dayMark([event("周会（休）", ms(2026, 10, 1, 9), ms(2026, 10, 1, 10))]), null);
  for (const title of ["立冬", "春节（休）", "正月初二", "七夕节", "中秋节", "国庆节"]) assert.ok(namesTheDay(holiday(title)), title);
  assert.ok(!namesTheDay(holiday("全员假期")));
  assert.ok(!namesTheDay(event("立冬", ms(2026, 11, 7, 9), ms(2026, 11, 7, 10))));
});

test("only days in the months read count as read", () => {
  const snapshot = { fromMs: ms(2026, 10, 1), toMs: ms(2027, 1, 1) };
  assert.ok(isRead(snapshot, ms(2026, 10, 1)));
  assert.ok(isRead(snapshot, ms(2026, 12, 31)));
  assert.ok(!isRead(snapshot, ms(2027, 1, 1)));
  assert.ok(!isRead(snapshot, ms(2026, 9, 30)));
  assert.ok(!isRead({ fromMs: 0, toMs: 0 }, ms(2026, 11, 9)));
});
