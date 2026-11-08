import { invoke } from "@tauri-apps/api/core";

/** The built-in plugin's id (src-tauri/src/plugin_host/builtin.rs SSH_TUNNEL_ID). */
export const SSH_TUNNEL_PLUGIN_ID = "focusd.ssh-proxy-tunnel";

/** Mirrors `tunnel::Status` as `TunnelHost.state` in src-tauri/src/ssh_tunnel/mod.rs. */
export type SshTunnelState = "off" | "connecting" | "connected" | "portInUse" | "error";

/** Mirrors TunnelHost in src-tauri/src/ssh_tunnel/mod.rs: one host of the SSH list and its tunnel. */
export type SshTunnelHost = {
  host: string;
  enabled: boolean;
  /** The port on the server; null until one is set. */
  remotePort: number | null;
  state: SshTunnelState;
  error: string | null;
};

export function getSshTunnels() {
  return invoke<SshTunnelHost[]>("get_ssh_tunnels");
}

/** Saves a host's switch and port on the server (null forgets the port); returns the new list. */
export function setSshTunnel(host: string, enabled: boolean, remotePort: number | null) {
  return invoke<SshTunnelHost[]>("set_ssh_tunnel", { host, enabled, remotePort });
}

/** Whether something already listens on the port on that host (one short ssh). */
export function checkSshTunnelPort(host: string, remotePort: number) {
  return invoke<boolean>("check_ssh_tunnel_port", { host, remotePort });
}
