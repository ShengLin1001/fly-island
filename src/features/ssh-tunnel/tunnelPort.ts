// Pure helpers for the tunnel hosts list: the server port field and the line to run there.

/** Ports below this only root may listen on (src-tauri/src/ssh_tunnel/config.rs MIN_REMOTE_PORT). */
export const MIN_REMOTE_PORT = 1024;

/** What the server port field holds: empty (no port), a valid port, or invalid. */
export function parseRemotePort(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const port = Number(trimmed);
  return port >= MIN_REMOTE_PORT && port <= 65535 ? port : "invalid";
}

/** The line that points a shell on the server at the tunnel; some tools read only the upper-case name. */
export function exportLine(port: number) {
  const url = `http://127.0.0.1:${port}`;
  return `export http_proxy=${url} https_proxy=${url} HTTPS_PROXY=${url}`;
}
