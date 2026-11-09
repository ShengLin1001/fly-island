import { ImageIcon, Star, TextQuote } from "lucide-react";
import type { MouseEvent } from "react";
import { useTranslation } from "../../i18n";
import type { ClipboardHistoryItem, ClipboardSnippet } from "./api";
import { ClipboardEntryIcon } from "./ClipboardEntryIcon";

/**
 * One row of the clipboard window: a history entry or a snippet (C24.6). The left column shows
 * the quick-paste digit, or the row's place in a sequence being picked (C24.7).
 */
export function ClipboardPopupRow({ index, selected, queued, entry, snippet, onPick, onHover, onToggleFavorite }: {
  index: number;
  selected: boolean;
  /** 1-based place in the sequence, or 0. */
  queued: number;
  entry?: ClipboardHistoryItem;
  snippet?: ClipboardSnippet;
  onPick: (event: MouseEvent) => void;
  onHover: () => void;
  onToggleFavorite?: () => void;
}) {
  const t = useTranslation();
  const preview = entry ? entry.preview : snippet?.title ?? "";
  const detail = entry
    ? [entry.tags?.map((tag) => `#${tag}`).join(" "), entry.note, entry.source?.name].filter(Boolean).join(" · ")
    : snippet?.text.split("\n").find((line) => line.trim() && line.trim() !== snippet.title) ?? "";

  return (
    <li
      data-index={index}
      role="option"
      aria-selected={selected}
      className={`clipboard-popup__item${selected ? " clipboard-popup__item--selected" : ""}${queued ? " clipboard-popup__item--queued" : ""}`}
      onPointerMove={() => !selected && onHover()}
    >
      <button className="clipboard-popup__row" type="button" tabIndex={-1} onClick={onPick}>
        <span className="clipboard-popup__index" aria-label={!queued && index < 9 ? t.clipboard.popup.quickPaste(index + 1) : undefined}>
          {queued ? queued : index < 9 ? index + 1 : ""}
        </span>
        {entry?.kind === "image" ? (
          <span className="clipboard-popup__thumb">
            {entry.image?.thumbnailDataUrl ? <img src={entry.image.thumbnailDataUrl} alt="" /> : <ImageIcon size={16} strokeWidth={1.5} absoluteStrokeWidth />}
          </span>
        ) : entry ? (
          <ClipboardEntryIcon item={entry} className="clipboard-popup__icon" />
        ) : (
          <TextQuote className="clipboard-popup__icon" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        )}
        <span className="clipboard-popup__text">
          <span className="clipboard-popup__preview">{preview}</span>
          {detail && <span className="clipboard-popup__note">{detail}</span>}
        </span>
      </button>
      {entry && onToggleFavorite && (
        <button
          className={`clipboard-popup__star${entry.favorite ? " clipboard-popup__star--on" : ""}`}
          type="button"
          tabIndex={-1}
          aria-label={entry.favorite ? t.clipboard.unfavoriteItem : t.clipboard.favoriteItem}
          aria-pressed={Boolean(entry.favorite)}
          onClick={onToggleFavorite}
        >
          <Star size={14} strokeWidth={1.5} absoluteStrokeWidth fill={entry.favorite ? "currentColor" : "none"} />
        </button>
      )}
    </li>
  );
}
