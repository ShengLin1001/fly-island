// Which mail service an address belongs to, so the island can show that
// service's logo; addresses of other services get the plain mail icon.

export type MailProvider = "qq" | "netease" | "gmail" | "outlook";

const PROVIDER_DOMAINS: Record<string, MailProvider> = {
  "qq.com": "qq",
  "vip.qq.com": "qq",
  "foxmail.com": "qq",
  "163.com": "netease",
  "vip.163.com": "netease",
  "126.com": "netease",
  "vip.126.com": "netease",
  "yeah.net": "netease",
  "188.com": "netease",
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
  "msn.com": "outlook",
};

/** Microsoft serves outlook.com, hotmail.com and live.com under many country endings. */
const OUTLOOK_DOMAIN = /^(outlook|hotmail|live)\.[a-z.]+$/;

export function mailProviderOf(email: string | null | undefined): MailProvider | null {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  return PROVIDER_DOMAINS[domain] ?? (OUTLOOK_DOMAIN.test(domain) ? "outlook" : null);
}

/** The one service all these addresses share; null when they differ or none is known. */
export function sharedMailProvider(emails: readonly (string | null | undefined)[]): MailProvider | null {
  const providers = new Set(emails.filter(Boolean).map(mailProviderOf));
  if (providers.size !== 1) return null;
  const [only] = providers;
  return only ?? null;
}
