import { AlertCircle, Check, ChevronLeft, Download, LoaderCircle } from "lucide-react";
import { useTranslation } from "../../../i18n";
import type { SaveState, TodoArchive, TodoPageMode } from "../types";

type Tab = "today" | "daily" | "upcoming" | "archive";

/** Which tab a page belongs to: a saved day is opened from the archive. */
const tabOf = (mode: TodoPageMode): Tab => (mode === "review" ? "archive" : mode);

/**
 * The island style's header: named tabs for the four pages in place of the paper's coloured
 * dots and toggles, and on the right what belongs to the page (saving on Today, a saved day's
 * progress while reading it).
 */
export function TodoIslandHeader({
  pageMode,
  openCount,
  scheduledCount,
  saveState,
  selectedArchive,
  onShowToday,
  onShowDaily,
  onShowUpcoming,
  onShowArchive,
  onSaveToday,
}: {
  pageMode: TodoPageMode;
  openCount: number;
  scheduledCount: number;
  saveState: SaveState;
  selectedArchive: TodoArchive | null;
  onShowToday: () => void;
  onShowDaily: () => void;
  onShowUpcoming: () => void;
  onShowArchive: () => void;
  onSaveToday: () => void;
}) {
  const text = useTranslation().todoIsland;
  const active = tabOf(pageMode);

  if (pageMode === "review" && selectedArchive) {
    const done = selectedArchive.todos.filter((todo) => todo.completed).length;
    return (
      <div className="todo-island__header">
        <button className="todo-island__back" type="button" onClick={onShowArchive} aria-label={text.backToArchive}>
          <ChevronLeft size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span>{selectedArchive.date}</span>
        </button>
        {selectedArchive.todos.length > 0 && <span className="todo-island__meta">{text.doneOf(done, selectedArchive.todos.length)}</span>}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number; open: () => void }[] = [
    { id: "today", label: text.today, count: openCount, open: onShowToday },
    { id: "daily", label: text.note, open: onShowDaily },
    // Only while something is scheduled (or the page is open), as the paper's calendar button.
    ...(scheduledCount > 0 || active === "upcoming" ? [{ id: "upcoming" as const, label: text.upcoming, count: scheduledCount, open: onShowUpcoming }] : []),
    { id: "archive", label: text.archive, open: onShowArchive },
  ];

  return (
    <div className="todo-island__header">
      <div className="todo-island__tabs" role="tablist" aria-label={text.tabsLabel}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === active ? "todo-island__tab todo-island__tab--active" : "todo-island__tab"}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-label={tab.id === "today" ? `${tab.label}, ${text.openCount(openCount)}` : undefined}
            onClick={tab.open}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && <span className="todo-island__tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>
      {active === "today" && <SaveButton state={saveState} onSave={onSaveToday} />}
    </div>
  );
}

function SaveButton({ state, onSave }: { state: SaveState; onSave: () => void }) {
  const text = useTranslation().todoIsland.save;
  const label = state === "saving" ? text.saving : state === "saved" ? text.saved : state === "needs-path" ? text.needsPath : state === "error" ? text.error : text.idle;
  const Icon = state === "saving" ? LoaderCircle : state === "saved" ? Check : state === "needs-path" || state === "error" ? AlertCircle : Download;
  return (
    <button className={`todo-island__save todo-island__save--${state}`} type="button" aria-label={label} onClick={onSave}>
      <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
    </button>
  );
}
