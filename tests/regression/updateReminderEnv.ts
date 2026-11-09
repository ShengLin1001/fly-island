// Runs before anything else on update-reminder.html: the updater initializes when its module
// loads, so it must already see a Tauri window, and settingsMocks must already know to offer
// the demo update.
Object.assign(globalThis, { isTauri: true, focusdDemoUpdate: true });
