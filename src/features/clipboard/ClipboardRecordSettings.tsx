import { useEffect, useState } from "react";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { ClipboardHistorySettings, ClipboardSecretHandling } from "./api";
import { CLIPBOARD_RETENTION_DAYS, parseExcludedApps } from "./settings";

/** The clipboard history's "what is recorded and kept" group (C22.4, C24). */
export function ClipboardRecordSettings({ clipboardSettings, onChange }: {
  clipboardSettings: ClipboardHistorySettings;
  onChange: (patch: Partial<ClipboardHistorySettings>) => void;
}) {
  const t = useTranslation();
  const text = t.settings.clipboard;
  const savedApps = clipboardSettings.excludedApps.join(", ");
  const [apps, setApps] = useState(savedApps);
  useEffect(() => setApps(savedApps), [savedApps]);

  return (
    <SettingsGroup title={text.title}>
      <SettingsToggleRow title={text.captureImages} checked={clipboardSettings.captureImages} onChange={(captureImages) => onChange({ captureImages })} />
      {clipboardSettings.captureImages && (
        <SettingsToggleRow indent title={text.ocr} description={text.ocrHint} checked={clipboardSettings.ocr} onChange={(ocr) => onChange({ ocr })} />
      )}
      <SettingsToggleRow title={text.captureFiles} description={text.captureFilesHint} checked={clipboardSettings.captureFiles} onChange={(captureFiles) => onChange({ captureFiles })} />
      <SettingsToggleRow title={text.captureHtml} description={text.captureHtmlHint} checked={clipboardSettings.captureHtml} onChange={(captureHtml) => onChange({ captureHtml })} />
      <SettingsToggleRow title={text.skipSensitive} description={text.skipSensitiveHint} checked={clipboardSettings.skipSensitive} onChange={(skipSensitive) => onChange({ skipSensitive })} />
      <SettingsRow
        title={text.secrets}
        description={text.secretsHint}
        control={
          <SettingsChoice<ClipboardSecretHandling>
            value={clipboardSettings.secrets}
            ariaLabel={text.secrets}
            options={[
              { value: "mask", label: text.secretsOptions.mask },
              { value: "skip", label: text.secretsOptions.skip },
              { value: "keep", label: text.secretsOptions.keep },
            ]}
            onChange={(secrets) => onChange({ secrets })}
          />
        }
      />
      <SettingsRow title={text.excludedApps} description={text.excludedAppsHint} labelFor="clipboard-excluded-apps">
        <SettingsInput
          id="clipboard-excluded-apps"
          value={apps}
          placeholder="keepass.exe, 1password.exe"
          onChange={(event) => setApps(event.currentTarget.value)}
          onBlur={() => onChange({ excludedApps: parseExcludedApps(apps) })}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </SettingsRow>
      <SettingsNumberRow title={text.maxItems} value={clipboardSettings.maxItems} min={5} max={200} onChange={(maxItems) => onChange({ maxItems })} />
      <SettingsRow
        title={text.retention}
        description={text.retentionHint}
        control={
          <SettingsSelect
            value={String(clipboardSettings.retentionDays)}
            ariaLabel={text.retention}
            options={CLIPBOARD_RETENTION_DAYS.map((days) => ({ value: String(days), label: text.retentionOption(days) }))}
            onChange={(value) => onChange({ retentionDays: Number(value) })}
          />
        }
      />
    </SettingsGroup>
  );
}
