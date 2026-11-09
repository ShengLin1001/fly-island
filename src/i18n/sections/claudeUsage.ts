import type { AgentUsageErrorKind } from "../../features/agent-status/api";

export type ResetParts = { days: number; hours: number; minutes: number };

export type ClaudeUsageText = {
  fiveHour: string;
  sevenDay: string;
  /** "5 小时 42% · 2 小时 13 分后重置"; `reset` is null when the snapshot gave no reset time. */
  window: (label: string, percent: number, reset: string | null) => string;
  /** The same with what is left: "5 小时 剩余 58% · 2 小时 13 分后重置". */
  windowLeft: (label: string, percent: number, reset: string | null) => string;
  resetsIn: (parts: ResetParts) => string;
  resettingSoon: string;
  updatedAgo: (minutes: number) => string;
  fromHud: string;
  fromApi: string;
  fromMagpie: string;
  fromCodex: string;
  fromGlm: string;
  fromKimi: string;
  /** "3 分钟前更新 · 来自 claude-hud". */
  updated: (ago: string, source: string) => string;
  /** The ring button's label: what the card says (it starts with the agent's name), and that a click re-reads it. */
  ringLabel: (details: string) => string;
  /** Claude's card without numbers. */
  noData: string;
  /** The other agents' cards before there are numbers. */
  noUsage: Record<"codex" | "glm" | "kimi", string>;
  /** Named windows that are not models (plan_usage.rs): Kimi's month, GLM's monthly MCP calls. */
  windowNames: Record<string, string>;
  /** Why asking GLM or Kimi with the saved API key failed. */
  planErrors: Record<AgentUsageErrorKind, string>;
  /** Why asking Anthropic directly failed; one per AgentUsageErrorKind in features/agent-status/api.ts. */
  errors: Record<AgentUsageErrorKind, string>;
  /** The API key fields on the plugin page (PlanKeyFields). */
  keys: {
    title: string;
    hint: string;
    label: (name: string) => string;
    savedPlaceholder: string;
    emptyPlaceholder: string;
    save: string;
    clear: string;
    saved: string;
    notSaved: string;
  };
};

export const zhCN: ClaudeUsageText = {
  fiveHour: "5 小时",
  sevenDay: "7 天",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  windowLeft: (label, percent, reset) => (reset ? `${label} 剩余 ${percent}% · ${reset}` : `${label} 剩余 ${percent}%`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `${days} 天 ${hours} 小时后重置` : hours > 0 ? `${hours} 小时 ${minutes} 分后重置` : `${minutes} 分后重置`,
  resettingSoon: "即将重置",
  updatedAgo: (minutes) => (minutes < 1 ? "刚刚更新" : minutes < 60 ? `${minutes} 分钟前更新` : `${Math.floor(minutes / 60)} 小时前更新`),
  fromHud: "来自 claude-hud",
  fromApi: "来自 Anthropic",
  fromMagpie: "来自 magpie",
  fromCodex: "来自 Codex 会话记录",
  fromGlm: "来自智谱开放平台",
  fromKimi: "来自 Kimi",
  updated: (ago, source) => `${ago} · ${source}`,
  ringLabel: (details) => `用量：${details}。点击刷新`,
  noData: "暂无 Claude 用量（需要本机的 magpie 网关、claude-hud 的用量快照，或在插件设置里打开「直接向 Anthropic 查询」）",
  noUsage: {
    codex: "暂无 Codex 用量（Codex 跑过一轮后，会话记录里才有额度）",
    glm: "暂无 GLM 用量（在插件页保存 GLM Coding Plan 的 API Key）",
    kimi: "暂无 Kimi 用量（在插件页保存 Kimi Code 的 API Key）",
  },
  windowNames: { month: "本月", mcpMonth: "MCP 本月" },
  planErrors: {
    noCredentials: "还没有保存 API Key，请在插件页填写",
    tokenExpired: "API Key 已过期，请在插件页重新保存",
    loginRequired: "API Key 无效或已过期，请在插件页重新保存",
    forbidden: "这个 API Key 没有 Coding Plan 套餐",
    rateLimited: "请求过于频繁，稍后自动重试",
    noProxy: "没有代理",
    network: "无法连接服务商",
    http: "服务商返回了错误",
    invalidResponse: "无法识别服务商返回的用量",
  },
  keys: {
    title: "API Key",
    hint: "GLM 填智谱开放平台（open.bigmodel.cn）的 API Key，Kimi 填 Kimi Code 控制台的 API Key。保存在 Windows 凭据管理器里，不写进设置文件，页面也不会再显示它。",
    label: (name) => `${name} API Key`,
    savedPlaceholder: "已保存，粘贴新的 Key 可替换",
    emptyPlaceholder: "粘贴 API Key",
    save: "保存",
    clear: "删除",
    saved: "已保存",
    notSaved: "未保存",
  },
  errors: {
    noCredentials: "未找到 Claude Code 的订阅登录，请先在 Claude Code 里登录",
    tokenExpired: "登录已过期，打开 Claude Code 以刷新登录",
    loginRequired: "需要在 Claude Code 里重新登录",
    forbidden: "当前登录无权读取用量，可尝试在 Claude Code 里重新登录",
    rateLimited: "请求过于频繁，稍后自动重试",
    noProxy: "没有代理：请在插件设置里填写代理地址",
    network: "无法通过代理连接 Anthropic",
    http: "Anthropic 返回了错误",
    invalidResponse: "无法识别 Anthropic 返回的用量",
  },
};

export const en: ClaudeUsageText = {
  fiveHour: "5h",
  sevenDay: "7d",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  windowLeft: (label, percent, reset) => (reset ? `${label} ${percent}% left · ${reset}` : `${label} ${percent}% left`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `resets in ${days}d ${hours}h` : hours > 0 ? `resets in ${hours}h ${minutes}m` : `resets in ${minutes}m`,
  resettingSoon: "resetting soon",
  updatedAgo: (minutes) => (minutes < 1 ? "updated just now" : minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.floor(minutes / 60)} h ago`),
  fromHud: "via claude-hud",
  fromApi: "from Anthropic",
  fromMagpie: "from magpie",
  fromCodex: "from Codex's session logs",
  fromGlm: "from Zhipu's open platform",
  fromKimi: "from Kimi",
  updated: (ago, source) => `${ago} · ${source}`,
  ringLabel: (details) => `Usage: ${details}. Click to refresh`,
  noData: "No Claude usage yet (needs a local magpie gateway, claude-hud's usage snapshot, or \"Ask Anthropic directly\" in the plugin settings)",
  noUsage: {
    codex: "No Codex usage yet (Codex's session logs carry it after a turn)",
    glm: "No GLM usage yet (save a GLM Coding Plan API key on the plugin page)",
    kimi: "No Kimi usage yet (save a Kimi Code API key on the plugin page)",
  },
  windowNames: { month: "Month", mcpMonth: "MCP month" },
  planErrors: {
    noCredentials: "No API key saved; add one on the plugin page",
    tokenExpired: "The API key expired; save it again on the plugin page",
    loginRequired: "The API key is invalid or expired; save it again on the plugin page",
    forbidden: "This API key has no coding plan",
    rateLimited: "Rate limited; retrying later",
    noProxy: "No proxy",
    network: "Can't reach the provider",
    http: "The provider returned an error",
    invalidResponse: "Unrecognized usage answer from the provider",
  },
  keys: {
    title: "API keys",
    hint: "For GLM, an API key from Zhipu's open platform (open.bigmodel.cn); for Kimi, one from the Kimi Code console. Keys are kept in the Windows Credential Manager, not in the settings file, and this page never shows them again.",
    label: (name) => `${name} API key`,
    savedPlaceholder: "Saved; paste a new key to replace it",
    emptyPlaceholder: "Paste an API key",
    save: "Save",
    clear: "Remove",
    saved: "Saved",
    notSaved: "Not saved",
  },
  errors: {
    noCredentials: "No Claude Code subscription login found; sign in to Claude Code first",
    tokenExpired: "Login expired; open Claude Code to renew it",
    loginRequired: "Sign in again in Claude Code",
    forbidden: "This login may not read usage; try signing in again in Claude Code",
    rateLimited: "Rate limited; retrying later",
    noProxy: "No proxy; set one in the plugin settings",
    network: "Can't reach Anthropic through the proxy",
    http: "Anthropic returned an error",
    invalidResponse: "Unrecognized usage answer from Anthropic",
  },
};
