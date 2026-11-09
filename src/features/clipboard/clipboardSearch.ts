import type { ClipboardHistoryItem } from "./api";

/**
 * Whether an entry matches a lower-case search: its words, note, files, the text OCR read in it
 * (C24.9) and the program it came from; "#tag" words must each be one of its tags (C24.5).
 * A masked key matches only by its note, tags and program, never by the key itself.
 */
export function matchesClipboardQuery(item: ClipboardHistoryItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  const haystack = [
    item.preview,
    item.masked ? "" : item.text ?? "",
    item.note ?? "",
    ...(item.files ?? []),
    item.ocrText ?? "",
    item.source?.name ?? "",
  ].join("\n").toLowerCase();
  return words.every((word) => (word.startsWith("#") && word.length > 1 ? tags.includes(word.slice(1)) : haystack.includes(word)));
}
