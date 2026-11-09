import type { ReactNode } from "react";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { ClipboardHistorySettings, ClipboardOpenIn, ClipboardPopupPosition } from "./api";
import { ClipboardRecordSettings } from "./ClipboardRecordSettings";

/**
 * The clipboard history options below the module switch (which is `enabled`, set by the
 * page): where it opens and how a pick pastes (C22), then what is recorded and kept.
 * `children` are further rows from outside this feature, such as the island page's row count.
 * Its shortcut, and Win+V, are set on the Shortcuts page.
 */
export function ClipboardSettingsSection({ clipboardSettings, onClipboardSettingsChange, children }: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  children?: ReactNode;
}) {
  const t = useTranslation();
  const text = t.settings.clipboard;
  const change = (patch: Partial<ClipboardHistorySettings>) => onClipboardSettingsChange({ ...clipboardSettings, ...patch });
  const inWindow = clipboardSettings.openIn === "window";

  return (
    <>
      <SettingsGroup title={text.openTitle}>
        <SettingsRow
          title={text.openIn}
          description={text.openInHint}
          control={
            <SettingsChoice<ClipboardOpenIn>
              value={clipboardSettings.openIn}
              ariaLabel={text.openIn}
              options={[
                { value: "window", label: text.openInOptions.window },
                { value: "island", label: text.openInOptions.island },
              ]}
              onChange={(openIn) => change({ openIn })}
            />
          }
        />
        {inWindow && (
          <SettingsRow
            indent
            title={text.popupPosition}
            control={
              <SettingsChoice<ClipboardPopupPosition>
                value={clipboardSettings.popupPosition}
                ariaLabel={text.popupPosition}
                options={[
                  { value: "cursor", label: text.popupPositionOptions.cursor },
                  { value: "center", label: text.popupPositionOptions.center },
                ]}
                onChange={(popupPosition) => change({ popupPosition })}
              />
            }
          />
        )}
        {inWindow && (
          <SettingsToggleRow
            indent
            title={text.autoPaste}
            description={text.autoPasteHint}
            checked={clipboardSettings.autoPaste}
            onChange={(autoPaste) => change({ autoPaste })}
          />
        )}
        {inWindow && clipboardSettings.autoPaste && (
          <SettingsToggleRow
            indent
            title={text.terminalImagePath}
            description={text.terminalImagePathHint}
            checked={clipboardSettings.terminalImagePath}
            onChange={(terminalImagePath) => change({ terminalImagePath })}
          />
        )}
        {children}
      </SettingsGroup>
      <ClipboardRecordSettings clipboardSettings={clipboardSettings} onChange={change} />
    </>
  );
}
