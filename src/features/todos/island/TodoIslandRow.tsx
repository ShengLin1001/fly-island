import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, Play, Square, Trash2 } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { getTodoTitleLineCount } from "../../../utils/text";
import type { TodoItem } from "../types";

const ICON = { size: 14, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true } as const;

/**
 * One todo in the island style: a round check, the title, and its actions, which show on hover or
 * focus. The todo being worked on keeps its stop button and an accent bar. `data-todo-id` and the
 * `.todo-list` around it are what dragging and plugin menus look for, as in the paper style.
 */
export function TodoIslandRow({
  todo,
  editable,
  isActive,
  canReorder,
  isDragging,
  isDragOver,
  isEditing,
  titleDraft,
  onTitleDraftChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onToggle,
  onStart,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  todo: TodoItem;
  /** Today's list; a saved day is read-only. */
  editable: boolean;
  isActive: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isEditing: boolean;
  titleDraft: string;
  onTitleDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (todo: TodoItem) => void;
  onToggle: (id: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>, todoId: string) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragCancel: () => void;
}) {
  const t = useTranslation();
  const className = [
    "todo-island-row",
    todo.completed ? "todo-island-row--done" : "",
    isActive ? "todo-island-row--active" : "",
    isDragging ? "todo-island-row--dragging" : "",
    isDragOver ? "todo-island-row--drag-over" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className} role="listitem" data-todo-id={todo.id} style={{ "--todo-title-lines": getTodoTitleLineCount(todo.title) } as CSSProperties}>
      <button
        className="todo-island-row__check"
        type="button"
        aria-pressed={todo.completed}
        disabled={!editable}
        aria-label={t.todo.actionOnTask(todo.completed ? t.todo.markIncomplete : t.todo.complete, todo.title)}
        onClick={() => onToggle(todo.id)}
      >
        {todo.completed && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      {editable && isEditing ? (
        <input
          className="todo-island-row__input"
          value={titleDraft}
          aria-label={t.todo.editTitle}
          autoFocus
          onChange={(event) => onTitleDraftChange(event.currentTarget.value)}
          onBlur={onCommitEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommitEdit();
            if (event.key === "Escape") onCancelEdit();
          }}
        />
      ) : editable ? (
        <button className="todo-island-row__title todo-island-row__title--editable" type="button" onClick={() => onStartEdit(todo)}>
          {todo.title}
        </button>
      ) : (
        <span className="todo-island-row__title">{todo.title}</span>
      )}
      {editable && (
        <span className="todo-island-row__actions">
          {isActive ? (
            <button className="todo-island-row__stop" type="button" aria-label={t.todo.actionOnTask(t.todo.stop, todo.title)} onClick={() => onStart(todo.id)}>
              <Square size={10} strokeWidth={0} fill="currentColor" aria-hidden="true" />
              {/* Says what it is; on hover, what clicking does. */}
              <span className="todo-island-row__stop-state">{t.todoIsland.inProgress}</span>
              <span className="todo-island-row__stop-action">{t.todo.stop}</span>
            </button>
          ) : (
            !todo.completed && (
              <button className="todo-island-row__action" type="button" aria-label={t.todo.actionOnTask(t.todo.start, todo.title)} onClick={() => onStart(todo.id)}>
                <Play {...ICON} />
              </button>
            )
          )}
          <button className="todo-island-row__action todo-island-row__action--delete" type="button" aria-label={t.todo.deleteTask(todo.title)} onClick={() => onDelete(todo.id)}>
            <Trash2 {...ICON} />
          </button>
          {canReorder && (
            <button
              className="todo-island-row__action todo-island-row__grip"
              type="button"
              aria-label={t.todo.reorderTask(todo.title)}
              disabled={isEditing}
              onPointerDown={(event) => onDragStart(event, todo.id)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragCancel}
            >
              <GripVertical {...ICON} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
