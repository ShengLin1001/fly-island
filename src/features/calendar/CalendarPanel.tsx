import { useEffect, useState } from "react";
import { RefreshCcw, Settings, Video } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { openMeetingLink, type CalendarEvent, type CalendarSnapshot } from "./api";
import { CalendarEmpty } from "./CalendarEmpty";
import { CalendarMonth } from "./CalendarMonth";
import { chineseDay } from "./lunar.ts";
import { eventsOn, isRead, monthStart, namesTheDay, nextDay, nextSpecialDay, startOfDay } from "./monthView.ts";
import { clockTime } from "./upcoming";
import "./CalendarPanel.css";

function join(link: string) {
  void openMeetingLink(link).catch((error: unknown) => console.error("Failed to open the meeting link", error));
}

/**
 * The island's calendar page: the day list on the left (today and tomorrow, or the day picked in
 * the month), each event with its time, title and place and a "Join" button for a meeting until
 * it ends; the month on the right, with lunar dates and holiday marks. Opening the page reads the
 * calendars again. With no calendar added, it shows how to add one (CalendarEmpty.tsx).
 */
export function CalendarPanel({
  snapshot,
  now,
  onRefresh,
  onOpenSettings,
}: {
  snapshot: CalendarSnapshot;
  now: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const t = useTranslation();
  const text = t.calendar;
  const lunar = useLocale().locale === "zh-CN";
  const today = startOfDay(now);
  // Null: today (so the page follows midnight); a month of null follows the picked day.
  const [picked, setPicked] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const selected = picked ?? today;
  const shownMonth = month ?? monthStart(selected);
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  if (snapshot.sourceCount === 0 && snapshot.events.length === 0) {
    return (
      <section className="calendar-panel" aria-label={text.title}>
        <CalendarEmpty onAdded={onRefresh} onOpenSettings={onOpenSettings} />
      </section>
    );
  }

  const select = (day: number) => {
    setPicked(day === today ? null : day);
    setMonth(null);
  };
  const subtitle = (day: number) => {
    if (!lunar) return "";
    const chinese = chineseDay(new Date(day));
    const named = chinese.festival ?? chinese.term;
    const coming = day === today && !named ? nextSpecialDay(day) : null;
    return [chinese.lunar, named, coming ? text.daysUntil(coming.name, coming.days) : ""].filter(Boolean).join(" · ");
  };
  const tomorrow = nextDay(today);
  const days = selected === today
    ? [{ day: today, label: `${text.today} · ${text.dayTitle(new Date(today))}` }, { day: tomorrow, label: `${text.tomorrow} · ${text.dayTitle(new Date(tomorrow))}` }]
    : [{ day: selected, label: text.dayTitle(new Date(selected)) }];

  const row = (event: CalendarEvent) => {
    const past = event.endMs <= now;
    const running = event.startMs <= now && now < event.endMs;
    const time = event.allDay ? text.allDay : `${clockTime(event.startMs)}–${clockTime(event.endMs)}`;
    return (
      <li key={`${event.uid}:${event.startMs}`} className={`calendar-event${past ? " calendar-event--past" : ""}${running && !event.allDay ? " calendar-event--now" : ""}`}>
        <span className="calendar-event__time">{time}</span>
        <span className="calendar-event__main">
          <span className="calendar-event__title">{event.title || text.untitled}</span>
          <span className="calendar-event__place">{[event.location, event.calendar].filter(Boolean).join(" · ")}</span>
        </span>
        {event.meetingLink && !past && (
          <button className="calendar-event__join" type="button" aria-label={text.joinLabel(event.title || text.untitled)} onClick={() => join(event.meetingLink!)}>
            <Video size={13} strokeWidth={2.4} aria-hidden="true" />
            {text.join}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="calendar-panel" aria-label={text.title}>
      <div className="calendar-panel__list">
        <div className="calendar-panel__head">
          <span className="calendar-panel__status">
            {snapshot.problems.length > 0 ? text.problems(snapshot.problems.length) : snapshot.fetchedAt ? text.updatedAt(clockTime(snapshot.fetchedAt)) : ""}
          </span>
          <button className="calendar-panel__icon" type="button" aria-label={text.refresh} onClick={onRefresh}>
            <RefreshCcw size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button className="calendar-panel__icon" type="button" aria-label={text.openSettings} onClick={onOpenSettings}>
            <Settings size={14} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="calendar-panel__days">
          {days.map(({ day, label }) => {
            const events = eventsOn(snapshot.events, day).filter((event) => !namesTheDay(event));
            const read = snapshot.fromMs === 0 || isRead(snapshot, day);
            const sub = subtitle(day);
            return (
              <div key={day} className="calendar-day">
                <h3 className="calendar-day__label">{label}</h3>
                {sub && <p className="calendar-day__lunar">{sub}</p>}
                {events.length > 0 ? <ul className="calendar-day__events">{events.map(row)}</ul> : <p className="calendar-day__empty">{read ? text.nothing : text.notRead}</p>}
              </div>
            );
          })}
        </div>
      </div>
      <CalendarMonth
        month={shownMonth}
        today={today}
        selected={selected}
        events={snapshot.events}
        onSelect={select}
        onMonth={(delta) => setMonth(monthStart(shownMonth, delta))}
      />
    </section>
  );
}
