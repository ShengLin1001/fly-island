export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";

export const EXPOSE_UI_KEY = "focusd-island-wechat-expose-ui";

/** Off unless the user turned it on: it changes a byte in the running WeChat. */
export function isWeChatExposeUiEnabled() {
  return window.localStorage.getItem(EXPOSE_UI_KEY) === "true";
}

export function saveWeChatExposeUiEnabled(enabled: boolean) {
  window.localStorage.setItem(EXPOSE_UI_KEY, String(enabled));
}

export function isWeChatRemindersEnabled() {
  return window.localStorage.getItem(ENABLED_KEY) !== "false";
}

export function saveWeChatRemindersEnabled(enabled: boolean) {
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}
