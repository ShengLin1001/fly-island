// The Chinese calendar for the calendar page's month: the lunar date (a table for 1900–2100),
// the 24 solar terms (a formula for 2000–2099) and the festivals.

/** A lunar date: the month's name ("十月", "闰六月") and the day (1–30). */
export type LunarDate = { month: string; day: number };

// One entry per lunar year from 1900 to 2100. Bits 15–4: months 1–12 have 30 days (else 29);
// bits 3–0: the leap month (0: none); bit 16: the leap month has 30 days. Built from
// lunar-javascript 1.7.8 and checked against it day by day. The WebView's own Chinese calendar
// (Intl) is not used: it puts new moons just before midnight on the next day, so it has, for one,
// the Spring Festival of 2027 on 7 February instead of the 6th.
const LUNAR_YEARS = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
];
/** The first day of the first lunar year in the table (1900's Spring Festival), as a UTC day. */
const LUNAR_BASE = Date.UTC(1900, 0, 31);
const MONTH_NAMES = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];

const monthDays = (info: number, month: number) => (info & (0x10000 >> month) ? 30 : 29);
const leapDays = (info: number) => (info & 0xf ? (info & 0x10000 ? 30 : 29) : 0);
const yearDays = (info: number) => {
  let days = leapDays(info);
  for (let month = 1; month <= 12; month++) days += monthDays(info, month);
  return days;
};

/** The lunar date of the local day `date`, or null outside the table (1900-01-31 to 2101). */
export function lunarDate(date: Date): LunarDate | null {
  let offset = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - LUNAR_BASE) / 86_400_000);
  if (offset < 0) return null;
  let year = 0;
  while (year < LUNAR_YEARS.length && offset >= yearDays(LUNAR_YEARS[year])) offset -= yearDays(LUNAR_YEARS[year++]);
  if (year >= LUNAR_YEARS.length) return null;
  const info = LUNAR_YEARS[year];
  const leap = info & 0xf;
  for (let month = 1; month <= 12; month++) {
    const days = monthDays(info, month);
    if (offset < days) return { month: MONTH_NAMES[month - 1], day: offset + 1 };
    offset -= days;
    if (month === leap) {
      if (offset < leapDays(info)) return { month: `闰${MONTH_NAMES[month - 1]}`, day: offset + 1 };
      offset -= leapDays(info);
    }
  }
  return null;
}

const DAY_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 初一 … 初十, 十一 … 十九, 二十, 廿一 … 廿九, 三十. */
export function lunarDayName(day: number) {
  if (day <= 10) return `初${DAY_DIGITS[day]}`;
  if (day < 20) return `十${DAY_DIGITS[day - 10]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${DAY_DIGITS[day - 20]}`;
  return "三十";
}

// The 24 solar terms in calendar order, two a month from January, with the 21st-century constant
// C of the day formula floor(Y * 0.2422 + C) - floor(L / 4) (Y: the year's last two digits; L is
// Y - 1 for the January and February terms, Y otherwise).
const TERMS: [string, number][] = [
  ["小寒", 5.4055], ["大寒", 20.12], ["立春", 3.87], ["雨水", 18.73], ["惊蛰", 5.63], ["春分", 20.646],
  ["清明", 4.81], ["谷雨", 20.1], ["立夏", 5.52], ["小满", 21.04], ["芒种", 5.678], ["夏至", 21.37],
  ["小暑", 7.108], ["大暑", 22.83], ["立秋", 7.5], ["处暑", 23.13], ["白露", 7.646], ["秋分", 23.042],
  ["寒露", 8.318], ["霜降", 23.438], ["立冬", 7.438], ["小雪", 22.36], ["大雪", 7.18], ["冬至", 21.94],
];

/** The years 2000–2099 where the formula is a day off: "year:term index" to the correction. */
const TERM_CORRECTIONS: Record<string, number> = {
  "2002:14": 1, "2008:9": 1, "2016:12": 1, "2019:0": -1, "2021:23": -1,
  "2026:3": -1, "2082:1": 1,"2089:19": 1, "2089:20": 1,
};

/** The day of `month` (0–11) on which its solar term `which` (0 or 1) falls, or null outside 2000–2099. */
export function solarTermDay(year: number, month: number, which: 0 | 1) {
  if (year < 2000 || year > 2099) return null;
  const index = month * 2 + which;
  const y = year % 100;
  const leapBase = index < 4 ? y - 1 : y;
  const day = Math.floor(y * 0.2422 + TERMS[index][1]) - Math.floor(leapBase / 4);
  return day + (TERM_CORRECTIONS[`${year}:${index}`] ?? 0);
}

/** The solar term on the local day `date`, or null. */
export function solarTerm(date: Date) {
  const [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
  for (const which of [0, 1] as const) {
    if (solarTermDay(year, month, which) === day) return TERMS[month * 2 + which][0];
  }
  return null;
}

const SOLAR_FESTIVALS: Record<string, string> = {
  "1-1": "元旦", "2-14": "情人节", "3-8": "妇女节", "3-12": "植树节", "4-1": "愚人节", "5-1": "劳动节", "5-4": "青年节",
  "6-1": "儿童节", "7-1": "建党节", "8-1": "建军节", "9-10": "教师节", "10-1": "国庆节", "12-24": "平安夜", "12-25": "圣诞节",
};

const LUNAR_FESTIVALS: Record<string, string> = {
  "正月-1": "春节", "正月-15": "元宵节", "二月-2": "龙抬头", "五月-5": "端午节", "七月-7": "七夕",
  "七月-15": "中元节", "八月-15": "中秋节", "九月-9": "重阳节", "腊月-8": "腊八节", "腊月-23": "小年",
};

/** The festival on the local day `date` (lunar ones first, then 除夕, then the Gregorian), or null. */
export function festival(date: Date, lunar: LunarDate | null = lunarDate(date)) {
  if (lunar) {
    const named = LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`];
    if (named) return named;
    if (lunar.month === "腊月" && lunar.day >= 29) {
      const next = lunarDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
      if (next?.month === "正月" && next.day === 1) return "除夕";
    }
  }
  return SOLAR_FESTIVALS[`${date.getMonth() + 1}-${date.getDate()}`] ?? null;
}

/** What a day of the Chinese calendar is, for the month's cell and the day's heading. */
export type ChineseDay = {
  /** The lunar date as words, "十月初一"; empty where the Chinese calendar is missing. */
  lunar: string;
  /** The cell's short line: a festival, else a solar term, else the lunar day (the month's name on the 1st). */
  label: string;
  /** Whether `label` is a festival or a solar term rather than a plain lunar day. */
  special: boolean;
  festival: string | null;
  term: string | null;
};

/** The Chinese calendar's view of the local day `date`. */
export function chineseDay(date: Date): ChineseDay {
  const lunar = lunarDate(date);
  const named = festival(date, lunar);
  const term = solarTerm(date);
  const plain = lunar ? (lunar.day === 1 ? lunar.month : lunarDayName(lunar.day)) : "";
  return {
    lunar: lunar ? `${lunar.month}${lunarDayName(lunar.day)}` : "",
    label: named ?? term ?? plain,
    special: Boolean(named ?? term),
    festival: named,
    term,
  };
}

/** Every name `chineseDay` can give a festival or a term, so holiday-feed entries that repeat them are known. */
export const CHINESE_DAY_NAMES: ReadonlySet<string> = new Set([
  ...TERMS.map(([name]) => name), ...Object.values(SOLAR_FESTIVALS), ...Object.values(LUNAR_FESTIVALS), "除夕",
]);
