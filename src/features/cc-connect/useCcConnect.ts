import { useCallback, useEffect, useState } from "react";
import { useErrorText } from "../../i18n";
import { useBuiltinPlugin } from "../plugins/useBuiltinPlugin";
import { CC_CONNECT_PLUGIN_ID, getCcConnectStatus, programSetting, type CcConnectStatus } from "./api";

/** Read again this often while shown, so a chat appears soon after its first message to the bot. */
const REFRESH_MS = 5_000;

/** The cc-connect plugin: whether it is on, its program setting, and what was found (read while on). */
export function useCcConnect() {
  const plugin = useBuiltinPlugin(CC_CONNECT_PLUGIN_ID);
  const path = programSetting(plugin.settings);
  const errorText = useErrorText();
  const [status, setStatus] = useState<CcConnectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getCcConnectStatus(path));
      setError(null);
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [path, errorText]);

  useEffect(() => {
    if (!plugin.enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [plugin.enabled, refresh]);

  return { enabled: plugin.enabled, path, status, error, refresh };
}
