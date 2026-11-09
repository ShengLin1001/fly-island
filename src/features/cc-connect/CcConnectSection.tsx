import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n";
import { chatLabel, installCcConnect, type CcConnectStatus } from "./api";
import { CcConnectSetup } from "./CcConnectSetup";
import { useCcConnect } from "./useCcConnect";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The cc-connect phone link's plugin page sections: the program found and how (or a download),
 * whether it runs and the island's own run of it, and the chats each project has talked to (the
 * phone push sends to those); then setting a new bot up (CcConnectSetup). Read while the plugin
 * is on, again every few seconds, so a chat shows soon after its first message to the bot.
 */
export function CcConnectSection() {
  const t = useTranslation().settings.plugins.ccConnect;
  const cc = useCcConnect();
  const { enabled, status, error, refresh } = cc;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  if (!enabled) return null;

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await installCcConnect();
      await refresh();
    } catch (reason) {
      setDownloadError(message(reason));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
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
              {status.runner !== "off" ? (
                <InfoRow label={t.runnerLabel} value={[t.runner[status.runner], status.runnerError].filter(Boolean).join(" · ")} />
              ) : null}
              {projectNames(status).map((name) => (
                <InfoRow key={name} label={name} value={chatsOf(status, name, t.platforms) || t.noChats} />
              ))}
            </div>
            {status.exe ? null : (
              <>
                <p className="plugin-card__error">{status.exeError ?? t.notFound}</p>
                <p className="settings-section__hint">{t.downloadHint}</p>
                <div>
                  <button className="plugin-card__button" type="button" disabled={downloading} onClick={() => void download()}>
                    {downloading ? t.downloading : t.download}
                  </button>
                </div>
              </>
            )}
            {status.exe && !status.running && status.runner === "off" ? <p className="plugin-card__error">{t.notRunning}</p> : null}
            {status.projects.length === 0 ? <p className="settings-section__hint">{t.noProjects}</p> : null}
          </>
        ) : null}
        {downloadError ? <p className="plugin-card__error">{downloadError}</p> : null}
        {error ? <p className="plugin-card__error">{error}</p> : null}
      </section>
      <CcConnectSetup cc={cc} />
    </>
  );
}

/** Every project: those in the config, then any only the session files know. */
function projectNames(status: CcConnectStatus) {
  return [...new Set([...status.configProjects, ...status.projects.map((project) => project.name)])];
}

function chatsOf(status: CcConnectStatus, name: string, platforms: Record<string, string>) {
  const project = status.projects.find((entry) => entry.name === name);
  return (project?.chats ?? []).map((chat) => chatLabel(chat, platforms)).join(", ");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="plugin-info__row">
      <span>{label}</span>
      <code title={value}>{value}</code>
    </div>
  );
}
