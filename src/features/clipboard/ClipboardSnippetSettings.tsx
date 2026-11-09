import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { deleteClipboardSnippet, getClipboardHistory, listenClipboardHistoryChanged, saveClipboardSnippet, type ClipboardSnippet } from "./api";
import "./ClipboardSnippetSettings.css";

type Draft = { id: string | null; title: string; text: string };

/** Settings → Clipboard → Snippets (C24.6): the list, and a form to add or change one. */
export function ClipboardSnippetSettings() {
  const t = useTranslation();
  const text = t.settings.clipboard.snippets;
  const [snippets, setSnippets] = useState<ClipboardSnippet[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    void getClipboardHistory()
      .then((snapshot) => setSnippets(snapshot.snippets ?? []))
      .catch((failure: unknown) => console.error("Failed to read the snippets", failure));
  }, []);

  useEffect(() => {
    refresh();
    let cancelled = false;
    let stop: (() => void) | null = null;
    void listenClipboardHistoryChanged(refresh).then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [refresh]);

  const save = () => {
    if (!draft) return;
    void saveClipboardSnippet(draft.id, draft.title, draft.text)
      .then((snapshot) => {
        setSnippets(snapshot.snippets ?? []);
        setDraft(null);
        setError("");
      })
      .catch((failure: unknown) => setError(String(failure)));
  };

  return (
    <SettingsGroup title={text.title}>
      <SettingsRow title={text.hintTitle} description={text.hint} searchable={false} />
      {snippets.map((snippet) => (
        <SettingsRow
          key={snippet.id}
          title={snippet.title}
          description={snippet.text.length > 80 ? `${snippet.text.slice(0, 80)}…` : snippet.text}
          searchable={false}
          control={
            <div className="clipboard-snippet__actions">
              <button type="button" aria-label={text.edit(snippet.title)} onClick={() => setDraft({ id: snippet.id, title: snippet.title, text: snippet.text })}>
                <Pencil size={14} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
              <button type="button" aria-label={text.remove(snippet.title)} onClick={() => void deleteClipboardSnippet(snippet.id).then((snapshot) => setSnippets(snapshot.snippets ?? []))}>
                <Trash2 size={14} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
            </div>
          }
        />
      ))}
      {draft ? (
        <SettingsRow title={draft.id ? text.editing : text.adding} searchable={false}>
          <div className="clipboard-snippet__form">
            <SettingsInput value={draft.title} placeholder={text.titlePlaceholder} aria-label={text.titlePlaceholder} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} />
            <textarea
              className="clipboard-snippet__text"
              value={draft.text}
              rows={4}
              placeholder={text.textPlaceholder}
              aria-label={text.textPlaceholder}
              onChange={(event) => setDraft({ ...draft, text: event.currentTarget.value })}
            />
            {error && <p className="clipboard-snippet__error" role="alert">{error}</p>}
            <div className="clipboard-snippet__buttons">
              <button type="button" onClick={() => setDraft(null)}>{text.cancel}</button>
              <button type="button" className="clipboard-snippet__save" disabled={!draft.text.trim()} onClick={save}>{text.save}</button>
            </div>
          </div>
        </SettingsRow>
      ) : (
        <SettingsRow
          title={text.add}
          searchable={false}
          control={
            <button type="button" className="clipboard-snippet__add" aria-label={text.add} onClick={() => setDraft({ id: null, title: "", text: "" })}>
              <Plus size={14} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          }
        />
      )}
    </SettingsGroup>
  );
}
