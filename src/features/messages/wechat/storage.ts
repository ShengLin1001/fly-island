export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";

export const EXPOSE_UI_KEY = "focusd-island-wechat-expose-ui";

/** Off unless the user turned it on: it changes a byte in the running WeChat. */
export function isWeChatExposeUiEnabled() {
  return window.localStorage.getItem(EXPOSE_UI_KEY) === "true";
}

export function saveWeChatExposeUiEnabled(enabled: boolean) {
  window.localStorage.setItem(EXPOSE_UI_KEY, String(enabled));
}

export const HIDE_TASKBAR_BUTTON_KEY = "focusd-island-wechat-hide-taskbar-button";

/** On unless the user turned it off: closed to the tray, WeChat's chat list cannot be read. */
export function isWeChatHideTaskbarButtonEnabled() {
  return window.localStorage.getItem(HIDE_TASKBAR_BUTTON_KEY) !== "false";
}

export function saveWeChatHideTaskbarButtonEnabled(enabled: boolean) {
  window.localStorage.setItem(HIDE_TASKBAR_BUTTON_KEY, String(enabled));
}

export function isWeChatRemindersEnabled() {
  return window.localStorage.getItem(ENABLED_KEY) !== "false";
}

export function saveWeChatRemindersEnabled(enabled: boolean) {
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}
