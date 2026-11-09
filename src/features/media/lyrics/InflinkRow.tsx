import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { useTranslation } from "../../../i18n";
import { getInflinkState, installInflink, type InflinkState } from "./api";

const INFLINK_URL = "https://github.com/apoint123/InfLink-rs";
const BETTERNCM_URL = "https://github.com/std-microblock/BetterNCM-Installer/releases/latest";

/**
 * NetEase's InfLink-rs plugin, which gives the music page a progress bar and exact lyrics. The
 * island installs it into BetterNCM's plugins folder; BetterNCM itself the user installs.
 */
export function InflinkRow() {
  const text = useTranslation().settings.lyrics.inflink;
  const [state, setState] = useState<InflinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let current = true;
    void getInflinkState(true).then((next) => { if (current) setState(next); }).catch((reason) => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, []);

  const open = (url: string) => void openUrl(url).catch(() => {});
  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await installInflink());
      setJustInstalled(true);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  let description: string = text.hint;
  let control = null;
  if (state && !state.betterNcm) {
    description = text.needsBetterNcm;
    control = <SettingsLinkButton onClick={() => open(BETTERNCM_URL)}>{text.getBetterNcm}</SettingsLinkButton>;
  } else if (state) {
    const outdated = state.installed !== null && state.latest !== null && state.installed !== state.latest;
    if (justInstalled) description = text.restart(state.installed ?? "");
    else if (outdated) description = text.updateAvailable(state.installed ?? "", state.latest ?? "");
    else if (state.installed) description = text.installed(state.installed);
    if (!state.installed || outdated) {
      control = (
        <SettingsLinkButton disabled={busy} onClick={() => void install()}>
          {busy ? text.installing : state.installed ? text.update : text.install}
        </SettingsLinkButton>
      );
    } else {
      control = <SettingsLinkButton onClick={() => open(INFLINK_URL)}>{text.about}</SettingsLinkButton>;
    }
  }

  return (
    <SettingsRow
      title={text.title}
      description={error ? `${description} ${text.failed(error)}` : description}
      control={control}
    />
  );
}
