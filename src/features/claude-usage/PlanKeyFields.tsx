import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useErrorText, useTranslation } from "../../i18n";
import { hasPlanKey, setPlanKey, type PlanProvider } from "../agent-status/api";
import { shownUsageProviders, type UsageProvider } from "./usageRing";
import "./PlanKeyFields.css";

type PlanUsageProvider = UsageProvider & { id: PlanProvider };

const isPlan = (provider: UsageProvider): provider is PlanUsageProvider => provider.id === "glm" || provider.id === "kimi";

/**
 * The usage plugin's page: an API key field for each coding plan switched on (GLM, Kimi). Plugin
 * settings are plain JSON on disk, so keys go to the Windows Credential Manager instead and are
 * never read back into the page: it only learns whether one is saved.
 */
export function PlanKeyFields({ settings, disabled }: { settings: Record<string, unknown>; disabled: boolean }) {
  const t = useTranslation();
  const providers = shownUsageProviders(settings).filter(isPlan);
  if (providers.length === 0) return null;
  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{t.claudeUsage.keys.title}</span>
      </div>
      <p className="settings-section__hint">{t.claudeUsage.keys.hint}</p>
      {providers.map((provider) => <PlanKeyField key={provider.id} provider={provider} disabled={disabled} />)}
    </section>
  );
}

function PlanKeyField({ provider, disabled }: { provider: PlanUsageProvider; disabled: boolean }) {
  const text = useTranslation().claudeUsage.keys;
  const errorText = useErrorText();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasPlanKey(provider.id)
      .then((has) => !cancelled && setSaved(has))
      .catch((failure: unknown) => !cancelled && setError(errorText(failure)));
    return () => {
      cancelled = true;
    };
  }, [provider.id, errorText]);

  const save = (key: string) => {
    setSaving(true);
    setError(null);
    setPlanKey(provider.id, key)
      .then((has) => {
        setSaved(has);
        setDraft("");
      })
      .catch((failure: unknown) => setError(errorText(failure)))
      .finally(() => setSaving(false));
  };
  const busy = disabled || saving;
  const label = text.label(provider.name);

  return (
    <div className="plugin-setting" data-plan-key={provider.id}>
      <label className="plugin-setting__row">
        <span>{label}</span>
        <input
          className="plugin-setting__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          placeholder={saved ? text.savedPlaceholder : text.emptyPlaceholder}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => event.key === "Enter" && draft.trim() && save(draft)}
        />
      </label>
      <div className="plan-key__actions">
        <p className={`plan-key__status ${error ? "plugin-card__error" : "settings-section__hint"}`}>
          {error ?? (saved === null ? "" : saved ? text.saved : text.notSaved)}
        </p>
        <div className="plugin-card__actions">
          <button className="plugin-card__button" type="button" disabled={busy || !draft.trim()} onClick={() => save(draft)}>
            <Check size={12} strokeWidth={2.4} />
            <span>{text.save}</span>
          </button>
          {saved ? (
            <button className="plugin-card__button" type="button" disabled={busy} onClick={() => save("")}>
              <Trash2 size={12} strokeWidth={2.4} />
              <span>{text.clear}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
