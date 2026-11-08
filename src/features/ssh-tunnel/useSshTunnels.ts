import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/error";
import { checkSshTunnelPort, getSshTunnels, setSshTunnel, type SshTunnelHost } from "./api";

/** How often the hosts' tunnel states are read again while the plugin page is open. */
const STATUS_POLL_MS = 3_000;

/** A port found taken on a host, waiting for the user's yes or no. */
export type TakenPort = { host: string; port: number };

/**
 * The SSH proxy tunnel's hosts: read, polled, switched and given ports. Switching a host on (or
 * moving a switched-on host to another port) asks the server first whether the port is taken, and
 * when it is, waits for `answer`.
 */
export function useSshTunnels() {
  const [hosts, setHosts] = useState<SshTunnelHost[] | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState<string | null>(null);
  const [taken, setTaken] = useState<TakenPort | null>(null);

  const refresh = useCallback(() => {
    getSshTunnels()
      .then((next) => setHosts(Array.isArray(next) ? next : []))
      .catch((reason: unknown) => {
        setHosts((current) => current ?? []);
        setError(getErrorMessage(reason));
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const save = (host: string, enabled: boolean, port: number | null) =>
    void setSshTunnel(host, enabled, port)
      .then((next) => {
        setError("");
        setHosts(next);
      })
      .catch((reason: unknown) => setError(getErrorMessage(reason)));

  const switchOn = (host: string, port: number) => {
    setChecking(host);
    checkSshTunnelPort(host, port)
      .then((inUse) => (inUse ? setTaken({ host, port }) : save(host, true, port)))
      // A check that cannot run (no ss or netstat there, say) does not hold the tunnel back: the
      // tunnel itself shows "port in use" if the server refuses the port.
      .catch(() => save(host, true, port))
      .finally(() => setChecking((current) => (current === host ? null : current)));
  };

  return {
    hosts,
    error,
    checking,
    taken,
    /** `port` is what the row's field holds now, saved or not. */
    toggle: (entry: SshTunnelHost, on: boolean, port: number | null) =>
      on && port !== null ? switchOn(entry.host, port) : on ? undefined : save(entry.host, false, port),
    setPort: (entry: SshTunnelHost, port: number | null) => {
      if (port === entry.remotePort) return;
      if (entry.enabled && port !== null) switchOn(entry.host, port);
      else save(entry.host, false, port);
    },
    /** Yes sets the tunnel up anyway (it waits for the port to free); no leaves the host off. */
    answer: (yes: boolean) => {
      if (!taken) return;
      setTaken(null);
      save(taken.host, yes, taken.port);
    },
  };
}
