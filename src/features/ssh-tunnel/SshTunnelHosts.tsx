import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SettingsSwitch } from "../../components/settings/SettingsSwitch";
import { useTranslation } from "../../i18n";
import type { SshTunnelHost } from "./api";
import { exportLine, parseRemotePort } from "./tunnelPort";
import { useSshTunnels } from "./useSshTunnels";
import "./SshTunnelHosts.css";

/**
 * The SSH proxy tunnel's plugin page section: every host of the SSH list with its switch, its
 * port on the server, how its tunnel is doing and the line to run there. Asks before setting up
 * a tunnel on a port the server already uses.
 */
export function SshTunnelHosts() {
  const t = useTranslation().settings.plugins.sshTunnel;
  const tunnels = useSshTunnels();

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{t.title}</span>
      </div>
      <p className="settings-section__hint">{t.hint}</p>
      {tunnels.hosts?.length === 0 ? <p className="settings-section__hint">{t.empty}</p> : null}
      {tunnels.hosts?.map((entry) => (
        <HostRow
          key={entry.host}
          entry={entry}
          checking={tunnels.checking === entry.host}
          takenPort={tunnels.taken?.host === entry.host ? tunnels.taken.port : null}
          onToggle={(on, port) => tunnels.toggle(entry, on, port)}
          onPort={(port) => tunnels.setPort(entry, port)}
          onAnswer={tunnels.answer}
        />
      ))}
      {tunnels.error ? <p className="plugin-card__error">{tunnels.error}</p> : null}
    </section>
  );
}

function HostRow({
  entry,
  checking,
  takenPort,
  onToggle,
  onPort,
  onAnswer,
}: {
  entry: SshTunnelHost;
  checking: boolean;
  takenPort: number | null;
  onToggle: (on: boolean, port: number | null) => void;
  onPort: (port: number | null) => void;
  onAnswer: (yes: boolean) => void;
}) {
  const text = useTranslation().settings.plugins;
  const t = text.sshTunnel;
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const [copied, setCopied] = useState(false);
  // The field as typed now: a switch flipped right after typing uses it before it is saved.
  const typed = (then: (port: number | null) => void) => {
    const port = parseRemotePort(field.current?.value ?? "");
    setInvalid(port === "invalid");
    if (port !== "invalid") then(port);
  };
  const state = checking
    ? t.checking
    : entry.remotePort === null
      ? t.needsPort
      : entry.enabled && entry.state === "off"
        ? t.waitingForPlugin
        : t.state[entry.state];
  const line = entry.enabled && entry.remotePort !== null ? exportLine(entry.remotePort) : null;

  return (
    <div className="ssh-tunnel__host">
      <div className="ssh-tunnel__head">
        <label htmlFor={id}>{entry.host}</label>
        <input
          key={entry.remotePort ?? ""}
          ref={field}
          className="plugin-setting__input ssh-tunnel__port"
          inputMode="numeric"
          placeholder={t.port}
          aria-label={`${entry.host} ${t.port}`}
          aria-invalid={invalid}
          defaultValue={entry.remotePort ?? ""}
          onBlur={() => typed(onPort)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
        <SettingsSwitch id={id} checked={entry.enabled} onChange={(on) => typed((port) => onToggle(on, port))} />
      </div>
      <p className={`ssh-tunnel__state ssh-tunnel__state--${checking ? "connecting" : entry.state}`}>
        {invalid ? t.portInvalid : state}
        {entry.state === "error" && entry.error ? <span className="ssh-tunnel__reason">{entry.error}</span> : null}
      </p>
      {takenPort !== null ? (
        <div className="ssh-tunnel__confirm" role="alertdialog" aria-label={t.confirm(entry.host, takenPort)}>
          <span>{t.confirm(entry.host, takenPort)}</span>
          <button className="plugin-card__button" type="button" onClick={() => onAnswer(true)}>
            {t.yes}
          </button>
          <button className="plugin-card__button" type="button" onClick={() => onAnswer(false)}>
            {t.no}
          </button>
        </div>
      ) : null}
      {line ? (
        <div className="ssh-tunnel__export">
          <code>{line}</code>
          <button
            className="plugin-card__button"
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(line).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} strokeWidth={2.4} />}
            <span>{copied ? text.detail.copied : text.detail.copy}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
