/** The session ring fed by claude-sessions' state files (features/claude-sessions). */
export type ClaudeSessionsText = {
  needs: string;
  yourturn: string;
  working: string;
  stale: string;
  done: string;
  /** No state directory: claude-sessions' hooks are not installed. */
  notDetected: string;
  empty: string;
  /** A session waiting on you in the ring's hover card: its state, then "title · project". */
  sessionLine: (state: string, name: string) => string;
  /** The clickable ring's label: its summary, then what a click does. */
  openAgents: (summary: string) => string;
};

export const zhCN: ClaudeSessionsText = {
  needs: "等授权",
  yourturn: "等你回复",
  working: "运行",
  stale: "可能已停",
  done: "完成",
  notDetected: "未检测到 claude-sessions",
  empty: "没有 Claude 会话",
  sessionLine: (state, name) => `${state}：${name}`,
  openAgents: (summary) => `${summary}，点击打开 Agent 页`,
};

export const en: ClaudeSessionsText = {
  needs: "Needs approval",
  yourturn: "Your turn",
  working: "Running",
  stale: "Maybe stalled",
  done: "Done",
  notDetected: "claude-sessions not detected",
  empty: "No Claude sessions",
  sessionLine: (state, name) => `${state}: ${name}`,
  openAgents: (summary) => `${summary}. Click to open the Agent page`,
};
