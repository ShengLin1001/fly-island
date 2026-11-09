import { RefreshCw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { chatLabel } from "./api";
import { useCcConnect } from "./useCcConnect";

/**
 * The cc-connect phone link's plugin page section: the program found and how, whether it runs,
 * and the chats each project has talked to (the phone push sends to those). Read while the
 * plugin is on; Refresh reads again, as after sending the bot its first message.
 */
export function CcConnectSection() {
  const t = useTranslation().settings.plugins.ccConnect;
  const { enabled, status, error, refresh } = useCcConnect();
  if (!enabled) return null;

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{t.title}</span>
        <button className="plugin-card__button" type="button" onClick={() => void refresh()} aria-label={t.refresh} title={t.refresh}>
          <RefreshCw size={12} strokeWidth={2.4} />
        </button>
      </div>
      <p className="settings-section__hint">{t.hint}</p>
      {status ? (
        <>
          <div className="plugin-info">
            {status.exe ? <InfoRow label={t.program} value={`${status.exe} · ${t.source[status.exeSource ?? "path"]}`} /> : null}
            {status.exe && status.running ? <InfoRow label={t.state} value={t.running} /> : null}
            {status.projects.map((project) => (
              <InfoRow key={project.name} label={project.name} value={project.chats.map((chat) => chatLabel(chat, t.platforms)).join(", ") || t.noChats} />
            ))}
          </div>
          {status.exe ? null : <p className="plugin-card__error">{status.exeError ?? t.notFound}</p>}
          {status.exe && !status.running ? <p className="plugin-card__error">{t.notRunning}</p> : null}
          {status.projects.length === 0 ? <p className="settings-section__hint">{t.noProjects}</p> : null}
        </>
      ) : null}
      {error ? <p className="plugin-card__error">{error}</p> : null}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="plugin-info__row">
      <span>{label}</span>
      <code title={value}>{value}</code>
    </div>
  );
}
