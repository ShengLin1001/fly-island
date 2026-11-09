import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ClipboardList, ImageIcon, Search, Star } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem } from "./api";
import { popupIndexAfterKey } from "./popupKeys";
import "./ClipboardPopup.css";

/**
 * The clipboard window's list (C22.2): a search box, then the entries newest first. ↑↓ move the
 * selection, Enter or a click pastes it, 1–9 paste that row, Esc closes. `openCount` changes each
 * time the window is shown, which clears the search and goes back to the top.
 */
export function ClipboardPopup({ items, openCount, onPaste, onClose, onToggleFavorite }: {
  items: readonly ClipboardHistoryItem[];
  openCount: number;
  onPaste: (id: string) => void;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setQuery("");
    setSelected(0);
    inputRef.current?.focus();
  }, [openCount]);

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? items.filter((item) => [item.preview, item.text ?? "", item.note ?? ""].join(" ").toLowerCase().includes(needle))
    : items;
  const current = Math.min(selected, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (shown[current]) onPaste(shown[current].id);
      return;
    }
    // Digits paste a row only while the search box is empty, so a search can still hold numbers.
    const action = popupIndexAfterKey(event.key, current, shown.length, query === "");
    if (!action) return;
    event.preventDefault();
    if (action.paste) {
      if (shown[action.index]) onPaste(shown[action.index].id);
    } else {
      setSelected(action.index);
    }
  };

  return (
    <section className="clipboard-popup" aria-label={t.clipboard.popup.title} onKeyDown={onKeyDown}>
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
      {shown.length === 0 ? (
        <p className="clipboard-popup__empty">{needle ? t.clipboard.emptySearch : t.clipboard.popup.empty}</p>
      ) : (
        <ul className="clipboard-popup__list" ref={listRef} role="listbox" aria-label={t.clipboard.popup.title}>
          {shown.map((item, index) => (
            <li
              key={item.id}
              data-index={index}
              role="option"
              aria-selected={index === current}
              className={`clipboard-popup__item${index === current ? " clipboard-popup__item--selected" : ""}`}
              onPointerMove={() => index !== current && setSelected(index)}
            >
              <button className="clipboard-popup__row" type="button" tabIndex={-1} onClick={() => onPaste(item.id)}>
                <span className="clipboard-popup__index" aria-label={index < 9 ? t.clipboard.popup.quickPaste(index + 1) : undefined}>
                  {index < 9 ? index + 1 : ""}
                </span>
                {item.kind === "image" ? (
                  <span className="clipboard-popup__thumb">
                    {item.image?.thumbnailDataUrl ? <img src={item.image.thumbnailDataUrl} alt="" /> : <ImageIcon size={16} strokeWidth={1.5} absoluteStrokeWidth />}
                  </span>
                ) : (
                  <ClipboardList className="clipboard-popup__icon" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
                )}
                <span className="clipboard-popup__text">
                  <span className="clipboard-popup__preview">{item.preview}</span>
                  {item.note && <span className="clipboard-popup__note">{item.note}</span>}
                </span>
              </button>
              <button
                className={`clipboard-popup__star${item.favorite ? " clipboard-popup__star--on" : ""}`}
                type="button"
                tabIndex={-1}
                aria-label={item.favorite ? t.clipboard.unfavoriteItem : t.clipboard.favoriteItem}
                aria-pressed={Boolean(item.favorite)}
                onClick={() => onToggleFavorite(item.id)}
              >
                <Star size={14} strokeWidth={1.5} absoluteStrokeWidth fill={item.favorite ? "currentColor" : "none"} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <footer className="clipboard-popup__hint">{t.clipboard.popup.hint}</footer>
    </section>
  );
}
