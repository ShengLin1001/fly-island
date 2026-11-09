import { useEffect, useState } from "react";
import { getSshTunnelProxy, type SshTunnelProxy } from "./api";

/** As often as the hosts' states (useSshTunnels.ts): the watcher there looks every 15 s. */
const POLL_MS = 3_000;

/** The local proxy the tunnels forward to, read while `on` (the plugin's page, plugin running). */
export function useSshTunnelProxy(on: boolean) {
  const [proxy, setProxy] = useState<SshTunnelProxy | null>(null);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    const read = () =>
      void getSshTunnelProxy()
        .then((next) => !cancelled && setProxy(next))
        .catch(() => !cancelled && setProxy(null));
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [on]);

  return on ? proxy : null;
}
