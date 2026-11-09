import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem, ClipboardSnippet } from "./api";
import { matchesClipboardQuery } from "./clipboardSearch";
import { ClipboardPopupRow } from "./ClipboardPopupRow";
import { popupIndexAfterKey, toggleQueued } from "./popupKeys";
import "./ClipboardPopup.css";

type Tab = "history" | "snippets";

/**
 * The clipboard window's list (C22.2): a search box, then the entries newest first, or the
 * snippets (Tab switches, C24.6). ↑↓ move the selection, Enter or a click pastes it (with Shift, as
 * plain text), 1–9 paste that row, Esc closes. Ctrl+click or Ctrl+Space picks entries for a
 * sequence that Enter starts (C24.7). `openCount` changes each time the window is shown, which
 * clears the search and the picks and goes back to the top of the history.
 */
export function ClipboardPopup({ items, snippets, openCount, onPaste, onPasteSnippet, onPasteSequence, onClose, onToggleFavorite }: {
  items: readonly ClipboardHistoryItem[];
  snippets: readonly ClipboardSnippet[];
  openCount: number;
  onPaste: (id: string, plain: boolean) => void;
  onPasteSnippet: (id: string) => void;
  onPasteSequence: (ids: string[]) => void;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
}) {
  const t = useTranslation();
  const [tab, setTab] = useState<Tab>("history");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setTab("history");
    setQuery("");
    setSelected(0);
    setQueue([]);
    inputRef.current?.focus();
  }, [openCount]);

  const needle = query.trim().toLowerCase();
  const shownItems = needle ? items.filter((item) => matchesClipboardQuery(item, needle)) : items;
  const shownSnippets = needle
    ? snippets.filter((snippet) => `${snippet.title}\n${snippet.text}`.toLowerCase().includes(needle))
    : snippets;
  const count = tab === "history" ? shownItems.length : shownSnippets.length;
  const current = Math.min(selected, Math.max(0, count - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, tab]);

  const pick = (index: number, plain: boolean) => {
    if (tab === "snippets") {
      if (shownSnippets[index]) onPasteSnippet(shownSnippets[index].id);
    } else if (shownItems[index]) {
      onPaste(shownItems[index].id, plain);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (queue.length > 0) setQueue([]);
      else onClose();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      setTab(tab === "history" ? "snippets" : "history");
      setSelected(0);
      return;
    }
    if (tab === "history" && event.ctrlKey && event.key === " ") {
      event.preventDefault();
      if (shownItems[current]) setQueue(toggleQueued(queue, shownItems[current].id));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (tab === "history" && queue.length > 0) onPasteSequence(queue);
      else pick(current, event.shiftKey);
      return;
    }
    // Digits paste a row only while the search box is empty, so a search can still hold numbers.
    const action = popupIndexAfterKey(event.key, current, count, query === "");
    if (!action) return;
    event.preventDefault();
    if (action.paste) pick(action.index, false);
    else setSelected(action.index);
  };

  const empty = needle ? t.clipboard.emptySearch : tab === "history" ? t.clipboard.popup.empty : t.clipboard.popup.noSnippets;
  const hint = queue.length > 0 ? t.clipboard.popup.sequenceHint(queue.length) : tab === "history" ? t.clipboard.popup.hint : t.clipboard.popup.snippetHint;

  return (
    <section className="clipboard-popup" aria-label={t.clipboard.popup.title} onKeyDown={onKeyDown}>
      <div className="clipboard-popup__top">
        <label className="clipboard-popup__search">
          <Search size={15} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder={t.clipboard.popup.search}
            aria-label={t.clipboard.popup.search}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelected(0);
            }}
          />
        </label>
        <div className="clipboard-popup__tabs" role="tablist">
          {(["history", "snippets"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              tabIndex={-1}
              aria-selected={tab === name}
              className={tab === name ? "clipboard-popup__tab clipboard-popup__tab--active" : "clipboard-popup__tab"}
              onClick={() => {
                setTab(name);
                setSelected(0);
                inputRef.current?.focus();
              }}
            >
              {t.clipboard.popup.tabs[name]}
            </button>
          ))}
        </div>
      </div>
      {count === 0 ? (
        <p className="clipboard-popup__empty">{empty}</p>
      ) : (
        <ul className="clipboard-popup__list" ref={listRef} role="listbox" aria-label={t.clipboard.popup.tabs[tab]}>
          {tab === "history"
            ? shownItems.map((item, index) => (
              <ClipboardPopupRow
                key={item.id}
                index={index}
                selected={index === current}
                queued={queue.indexOf(item.id) + 1}
                entry={item}
                onHover={() => setSelected(index)}
                onPick={(event) => {
                  if (event.ctrlKey) setQueue(toggleQueued(queue, item.id));
                  else onPaste(item.id, event.shiftKey);
                }}
                onToggleFavorite={() => onToggleFavorite(item.id)}
              />
            ))
            : shownSnippets.map((snippet, index) => (
              <ClipboardPopupRow
                key={snippet.id}
                index={index}
                selected={index === current}
                queued={0}
                snippet={snippet}
                onHover={() => setSelected(index)}
                onPick={() => onPasteSnippet(snippet.id)}
              />
            ))}
        </ul>
      )}
      <footer className="clipboard-popup__hint">{hint}</footer>
    </section>
  );
}
