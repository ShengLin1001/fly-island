import { CircleCheckBig, Plus } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { TodoDatePicker } from "../TodoDatePicker";
import type { TodoItem } from "../types";
import { useTodoNotebookEditing } from "../useTodoNotebookEditing";
import { TodoIslandRow } from "./TodoIslandRow";

/** Today's list with the field to add to it, or a saved day's list (read-only, no field). */
export function TodoIslandTasks({
  todos,
  editable,
  draft,
  draftDate,
  currentDate,
  activeTodoId,
  enableTodoReorder,
  scrollStartRows,
  onDraftChange,
  onDraftDateChange,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onStartTodo,
  onDeleteTodo,
  onReorderTodo,
}: {
  todos: TodoItem[];
  editable: boolean;
  draft: string;
  draftDate: string | null;
  currentDate: string;
  activeTodoId: string | null;
  enableTodoReorder: boolean;
  scrollStartRows: number;
  onDraftChange: (value: string) => void;
  onDraftDateChange: (date: string | null) => void;
  onAddTodo: () => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, title: string) => void;
  onStartTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onReorderTodo: (sourceId: string, targetId: string) => void;
}) {
  const t = useTranslation();
  const text = t.todoIsland;
  const canReorder = editable && enableTodoReorder;
  const editing = useTodoNotebookEditing(editable, canReorder, onUpdateTodo, onReorderTodo);
  const later = draftDate !== null && draftDate > currentDate;

  return (
    <>
      {editable && (
        <form
          className="todo-island__composer"
          onSubmit={(event) => {
            event.preventDefault();
            onAddTodo();
          }}
        >
          <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <input
            value={draft}
            placeholder={later ? text.addPlaceholderFor(draftDate) : text.addPlaceholder}
            aria-label={t.notebook.addTaskHint}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
          />
          <TodoDatePicker value={draftDate} today={currentDate} disabled={false} onChange={onDraftDateChange} labels={{ today: text.today, tomorrow: text.tomorrow }} />
        </form>
      )}
      <div className={todos.length > scrollStartRows ? "todo-list todo-island__list todo-island__list--scroll" : "todo-list todo-island__list"} role="list">
        {todos.length === 0 ? (
          <div className="todo-island__empty">
            <CircleCheckBig size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
            <strong>{editable ? text.emptyTitle : text.noArchiveTasks}</strong>
            {editable && <span>{text.emptyHint}</span>}
          </div>
        ) : (
          todos.map((todo) => (
            <TodoIslandRow
              key={todo.id}
              todo={todo}
              editable={editable}
              isActive={editable && todo.id === activeTodoId && !todo.completed}
              canReorder={canReorder}
              isDragging={editing.draggedTodoId === todo.id}
              isDragOver={editing.dragOverTodoId === todo.id}
              isEditing={editing.editingTodoId === todo.id}
              titleDraft={editing.todoTitleDraft}
              onTitleDraftChange={editing.setTodoTitleDraft}
              onCommitEdit={editing.commitTodoTitleEdit}
              onCancelEdit={editing.cancelTodoTitleEdit}
              onStartEdit={editing.startTodoTitleEdit}
              onToggle={onToggleTodo}
              onStart={onStartTodo}
              onDelete={onDeleteTodo}
              onDragStart={editing.startTodoDrag}
              onDragMove={editing.moveTodoDrag}
              onDragEnd={editing.finishTodoDrag}
              onDragCancel={editing.cancelTodoDrag}
            />
          ))
        )}
      </div>
    </>
  );
}
