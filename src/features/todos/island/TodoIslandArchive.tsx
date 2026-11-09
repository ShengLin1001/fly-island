import { ChevronRight } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { TodoArchive } from "../types";

/**
 * The saved days in the island style: one list, newest first, grouped by month. Each day shows
 * how much of it got done and its first task, which tells more at a glance than the paper's
 * cards and timeline, so the island style has no layout switch.
 */
export function TodoIslandArchive({ archives, onSelect }: { archives: TodoArchive[]; onSelect: (date: string) => void }) {
  const t = useTranslation();
  const text = t.todoIsland;
  if (archives.length === 0) {
    return <div className="todo-island__empty"><strong>{text.noArchives}</strong></div>;
  }
  const month = new Intl.DateTimeFormat(t.localeTag, { year: "numeric", month: "long" });
  const monthDay = new Intl.DateTimeFormat(t.localeTag, { month: "numeric", day: "numeric" });
  const weekday = new Intl.DateTimeFormat(t.localeTag, { weekday: "short" });
  const day = { format: (date: Date) => `${monthDay.format(date)} ${weekday.format(date)}` };
  const groups = new Map<string, TodoArchive[]>();
  for (const archive of [...archives].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = archive.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), archive]);
  }

  return (
    <div className="todo-island__archive" role="list">
      {[...groups].map(([key, days]) => (
        <div className="todo-island__archive-month" key={key} role="group" aria-label={month.format(new Date(`${key}-01T00:00:00`))}>
          <div className="todo-island__section-label">{month.format(new Date(`${key}-01T00:00:00`))}</div>
          {days.map((archive) => {
            const total = archive.todos.length;
            const done = archive.todos.filter((todo) => todo.completed).length;
            const first = archive.todos.find((todo) => !todo.completed) ?? archive.todos[0];
            return (
              <button className="todo-island__archive-day" key={archive.date} type="button" role="listitem" onClick={() => onSelect(archive.date)}>
                <span className="todo-island__archive-date">{day.format(new Date(`${archive.date}T00:00:00`))}</span>
                <span className="todo-island__archive-preview">{first?.title ?? text.noArchiveTasks}</span>
                {total > 0 && (
                  <span className="todo-island__archive-progress" aria-label={text.doneOf(done, total)}>
                    <span className="todo-island__archive-bar"><span style={{ width: `${(done / total) * 100}%` }} /></span>
                    {done}/{total}
                  </span>
                )}
                <ChevronRight size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
