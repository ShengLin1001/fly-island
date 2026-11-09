import { SettingsLinkButton } from "../../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../../components/settings/SettingsRow";
import { SettingsSelect } from "../../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../../i18n";
import { chatLabel, type useCcConnect } from "../../cc-connect";
import type { CcConnectPushTarget } from "./storage";

/**
 * Settings → AI Agent → Alerts → Phone push with the cc-connect channel: the project whose bots
 * send, and which of its chats get the push. The chats are the ones that have talked to the bot.
 */
export function CcConnectPushTargets({
  cc,
  target,
  onChange,
}: {
  cc: ReturnType<typeof useCcConnect>;
  target: CcConnectPushTarget;
  onChange: (target: CcConnectPushTarget) => void;
}) {
  const t = useTranslation().settings;
  const text = t.agent.push.ccConnect;
  if (!cc.enabled) return <SettingsRow indent title={text.off} description={text.offHint} />;

  const projects = cc.status?.projects ?? [];
  const project = projects.find((entry) => entry.name === target.project);
  const options = [
    ...(target.project ? [] : [{ value: "", label: text.pickProject }]),
    ...projects.map((entry) => ({ value: entry.name, label: entry.name })),
    // A saved project whose session file is gone still shows, so the choice is not lost unseen.
    ...(target.project && !project ? [{ value: target.project, label: target.project }] : []),
  ];
  const toggle = (key: string, on: boolean) =>
    onChange({ ...target, chats: on ? [...target.chats, key] : target.chats.filter((chat) => chat !== key) });

  return (
    <>
      <SettingsRow
        indent
        title={text.project}
        description={cc.error ?? text.projectHint}
        control={
          <SettingsSelect
            value={target.project}
            options={options}
            ariaLabel={text.project}
            onChange={(name) => onChange({ project: name, chats: name === target.project ? target.chats : [] })}
          />
        }
      />
      {project?.chats.map((chat) => (
        <SettingsToggleRow
          key={chat.key}
          indent
          title={chatLabel(chat, t.plugins.ccConnect.platforms)}
          description={chat.key}
          checked={target.chats.includes(chat.key)}
          onChange={(on) => toggle(chat.key, on)}
        />
      ))}
      {project && project.chats.length === 0 ? (
        <SettingsRow indent title={text.noChats} control={<SettingsLinkButton onClick={() => void cc.refresh()}>{text.refresh}</SettingsLinkButton>} />
      ) : null}
    </>
  );
}
