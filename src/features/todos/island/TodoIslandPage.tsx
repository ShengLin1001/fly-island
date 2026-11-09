import type { ComponentProps } from "react";
import { useTranslation } from "../../../i18n";
import { ScheduledTodoList } from "../ScheduledTodoList";
import { TodoDataNotice } from "../TodoDataNotice";
import type { TodoNotebook } from "../TodoNotebook";
import { TodoIslandArchive } from "./TodoIslandArchive";
import { TodoIslandHeader } from "./TodoIslandHeader";
import { TodoIslandTasks } from "./TodoIslandTasks";
import "./TodoIslandPage.css";
import "./TodoIslandRow.css";

/**
 * The todo page in the island style (Settings → Todos → Style): the same pages and data as the
 * paper notebook, drawn like the island's other pages, on the island's own surface in its ink.
 */
export function TodoIslandPage(props: ComponentProps<typeof TodoNotebook>) {
  const t = useTranslation();
  const { pageMode, todos, selectedArchive } = props;
  const isReview = pageMode === "review";
  const shown = isReview ? selectedArchive?.todos ?? [] : todos;

  return (
    <section className={`todo-island todo-island--${pageMode}`} aria-label={t.notebook.sectionLabel}>
      <TodoIslandHeader
        pageMode={pageMode}
        openCount={todos.filter((todo) => !todo.completed).length}
        scheduledCount={props.scheduledTodos.length}
        saveState={props.saveState}
        selectedArchive={selectedArchive}
        onShowToday={props.onShowToday}
        onShowDaily={props.onShowDaily}
        onShowUpcoming={props.onShowUpcoming}
        onShowArchive={props.onShowArchive}
        onSaveToday={props.onSaveToday}
      />
      {(pageMode === "today" || isReview) && (
        <TodoIslandTasks
          todos={shown}
          editable={pageMode === "today"}
          draft={props.draft}
          draftDate={props.draftDate}
          currentDate={props.currentDate}
          activeTodoId={props.activeTodoId}
          enableTodoReorder={props.enableTodoReorder}
          scrollStartRows={props.scrollStartRows}
          onDraftChange={props.onDraftChange}
          onDraftDateChange={props.onDraftDateChange}
          onAddTodo={props.onAddTodo}
          onToggleTodo={props.onToggleTodo}
          onUpdateTodo={props.onUpdateTodo}
          onStartTodo={props.onStartTodo}
          onDeleteTodo={props.onDeleteTodo}
          onReorderTodo={props.onReorderTodo}
        />
      )}
      {pageMode === "daily" && (
        <textarea
          className="todo-island__note"
          value={props.dailyNote}
          placeholder={t.todoIsland.notePlaceholder}
          aria-label={t.notebook.dailyNoteLabel}
          spellCheck={false}
          onChange={(event) => props.onDailyNoteChange(event.currentTarget.value)}
        />
      )}
      {pageMode === "upcoming" && <ScheduledTodoList todos={props.scheduledTodos} onDelete={props.onDeleteScheduledTodo} />}
      {pageMode === "archive" && <TodoIslandArchive archives={props.archives} onSelect={props.onSelectArchive} />}
      <TodoDataNotice />
    </section>
  );
}
