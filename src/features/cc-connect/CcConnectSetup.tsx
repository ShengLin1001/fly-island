import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, type ReactNode } from "react";
import { SelectControl } from "../../components/controls/SelectControl";
import { useTranslation } from "../../i18n";
import {
  addCcConnectProject,
  allowFromValid,
  CC_CONNECT_SETUP_PLATFORMS,
  checkCcConnectBot,
  freeProjectName,
  type CcConnectBotCheck,
  type CcConnectSetupPlatform,
} from "./api";
import { FeishuSetup } from "./FeishuSetup";
import type { useCcConnect } from "./useCcConnect";
import "./CcConnectSetup.css";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The plugin page's "Set up a bot": a project for one Telegram, Discord or Feishu bot added to
 * cc-connect's config (src-tauri/src/cc_connect/config_file.rs), so chatting with that bot is
 * using Claude Code on this computer. Telegram and Discord take the bot's token and who may use
 * it; on Telegram the people who wrote to the bot are listed to pick from. Feishu is cc-connect's
 * own QR setup (FeishuSetup).
 */
export function CcConnectSetup({ cc }: { cc: ReturnType<typeof useCcConnect> }) {
  const texts = useTranslation().settings.plugins.ccConnect;
  const t = texts.setup;
  const [platform, setPlatform] = useState<CcConnectSetupPlatform>("telegram");
  const [project, setProject] = useState<string | null>(null);
  const [workDir, setWorkDir] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [allowFrom, setAllowFrom] = useState("");
  const [bot, setBot] = useState<CcConnectBotCheck | null>(null);
  const [busy, setBusy] = useState<"check" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [feishu, setFeishu] = useState(false);

  const status = cc.status;
  if (!status) return null;
  const name = project ?? freeProjectName([...status.configProjects, ...status.projects.map((entry) => entry.name)]);
  const folder = workDir ?? status.home;
  const ids = allowFrom.split(",").map((id) => id.trim()).filter(Boolean);

  const pick = (next: string) => {
    setPlatform(next as CcConnectSetupPlatform);
    setToken("");
    setAllowFrom("");
    setBot(null);
    setError(null);
    setAdded(false);
  };
  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      const found = await checkCcConnectBot(platform, token);
      setBot(found);
      if (found.senders.length === 1 && !allowFrom) setAllowFrom(found.senders[0].id);
    } catch (reason) {
      setBot(null);
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  };
  const add = async () => {
    setBusy("add");
    setError(null);
    try {
      await addCcConnectProject(cc.path, { project: name, workDir: folder, platform, token, allowFrom });
      if (platform === "feishu") {
        setFeishu(true);
      } else {
        setAdded(true);
        setProject(null);
        setToken("");
        setAllowFrom("");
        setBot(null);
      }
      void cc.refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  };
  const toggleSender = (id: string) => setAllowFrom((ids.includes(id) ? ids.filter((have) => have !== id) : [...ids, id]).join(","));
  const ready = name.trim() !== "" && folder.trim() !== "" && busy === null;
  const canAdd = ready && token.trim() !== "" && ids.length > 0 && allowFromValid(allowFrom);

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{t.title}</span>
      </div>
      <p className="settings-section__hint">{t.hint}</p>
      <Field label={t.platform}>
        <SelectControl
          value={platform}
          options={CC_CONNECT_SETUP_PLATFORMS.map((value) => ({ value, label: texts.platforms[value] ?? value }))}
          ariaLabel={t.platform}
          disabled={feishu}
          onChange={pick}
        />
      </Field>
      <Field label={t.project} hint={t.projectHint}>
        <input className="plugin-setting__input" value={name} disabled={feishu} onChange={(event) => setProject(event.currentTarget.value)} />
      </Field>
      <Field label={t.workDir} hint={t.workDirHint}>
        <input className="plugin-setting__input" value={folder} disabled={feishu} onChange={(event) => setWorkDir(event.currentTarget.value)} />
      </Field>
      <ol className="cc-connect-setup__steps">
        {t.steps[platform].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {platform === "feishu" ? (
        feishu ? (
          <FeishuSetup onEnd={() => setFeishu(false)} />
        ) : (
          <div className="cc-connect-setup__actions">
            <button className="plugin-card__button" type="button" disabled={!ready || !status.exe} onClick={() => void add()}>
              {busy === "add" ? t.adding : t.feishuStart}
            </button>
          </div>
        )
      ) : (
        <>
          <Field label={t.token}>
            <div className="cc-connect-setup__inline">
              <input
                className="plugin-setting__input"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => {
                  setToken(event.currentTarget.value);
                  setBot(null);
                }}
              />
              <button className="plugin-card__button" type="button" disabled={!token.trim() || busy !== null} onClick={() => void check()}>
                {busy === "check" ? t.checking : platform === "telegram" ? t.find : t.check}
              </button>
            </div>
          </Field>
          {bot ? (
            <div className="cc-connect-setup__actions">
              <p className="settings-section__hint">{t.bot(bot.name)}</p>
              {bot.inviteUrl ? (
                <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => void openUrl(bot.inviteUrl ?? "")}>
                  {t.invite}
                </button>
              ) : null}
            </div>
          ) : null}
          {platform === "telegram" && bot ? (
            bot.senders.length > 0 ? (
              <div className="cc-connect-setup__senders">
                <p className="settings-section__hint">{t.senders}</p>
                {bot.senders.map((sender) => (
                  <button
                    key={sender.id}
                    className="plugin-card__button cc-connect-setup__sender"
                    type="button"
                    aria-pressed={ids.includes(sender.id)}
                    onClick={() => toggleSender(sender.id)}
                  >
                    {`${sender.name} · ${sender.id}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="settings-section__hint">{t.noSenders}</p>
            )
          ) : null}
          <Field label={t.allowFrom} hint={allowFrom.trim() && !allowFromValid(allowFrom) ? t.allowFromInvalid : t.allowFromHint}>
            <input className="plugin-setting__input" value={allowFrom} onChange={(event) => setAllowFrom(event.currentTarget.value)} />
          </Field>
          <div className="cc-connect-setup__actions">
            <button className="plugin-card__button" type="button" disabled={!canAdd} onClick={() => void add()}>
              {busy === "add" ? t.adding : t.add}
            </button>
          </div>
        </>
      )}
      {added ? <p className="settings-section__hint">{t.added}</p> : null}
      {error ? <p className="plugin-card__error">{error}</p> : null}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="plugin-setting">
      <label className="plugin-setting__row">
        <span>{label}</span>
        {children}
      </label>
      {hint ? <p className="settings-section__hint">{hint}</p> : null}
    </div>
  );
}
