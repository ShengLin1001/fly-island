import qqIcon from "../../assets/brands/qq.png";
import wechatIcon from "../../assets/brands/wechat.png";
import mailIcon from "../../assets/brands/mail.png";
import qqMailIcon from "../../assets/brands/mail-qq.png";
import neteaseMailIcon from "../../assets/brands/mail-netease.png";
import gmailIcon from "../../assets/brands/mail-gmail.png";
import outlookIcon from "../../assets/brands/mail-outlook.png";
import { Puzzle } from "lucide-react";
import { mailProviderOf, type MailProvider } from "./mail/mailProvider";
import type { MessageSource, PreviewSource } from "./messagePreview";
import "./MessageSourceIcon.css";

const SOURCE_ICONS: Record<MessageSource, string> = {
  qq: qqIcon,
  wechat: wechatIcon,
  qqMail: mailIcon,
};

const MAIL_PROVIDER_ICONS: Record<MailProvider, string> = {
  qq: qqMailIcon,
  netease: neteaseMailIcon,
  gmail: gmailIcon,
  outlook: outlookIcon,
};

/**
 * A message source's icon. Mail shows the logo of the mailbox's service: pass
 * `account` (the mailbox address), or `mailProvider` when several mailboxes
 * share one; an unknown service, or none, gets the plain mail icon.
 */
export function MessageSourceIcon({ source, size = 16, account, mailProvider }: {
  source: PreviewSource;
  size?: number;
  account?: string | null;
  mailProvider?: MailProvider | null;
}) {
  if (source === "plugin") {
    return <Puzzle className="message-brand-icon message-brand-icon--plugin" size={size} strokeWidth={2.2} aria-hidden="true" />;
  }
  const provider = source === "qqMail" ? mailProvider ?? mailProviderOf(account) : null;
  const src = provider ? MAIL_PROVIDER_ICONS[provider] : SOURCE_ICONS[source];
  const className = `message-brand-icon message-brand-icon--${source}${provider ? ` message-brand-icon--mail-${provider}` : ""}`;
  return <img className={className} src={src} alt="" aria-hidden="true" width={size} height={size} draggable={false} />;
}
