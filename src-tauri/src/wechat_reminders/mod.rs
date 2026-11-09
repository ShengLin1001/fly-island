//! WeChat reminders: watches WeChat's tray flash and restores its window on request. When WeChat
//! exposes its UI (Qt accessibility switched on, e.g. by a screen reader or a plugin), a flash also
//! reads the chat list to tell who wrote and what. The "expose WeChat's UI" setting switches that
//! on in the running WeChat (gate.rs).

mod chats;
mod gate;
mod plugin_view;
mod source;

#[cfg(test)]
mod tests;

use serde::Serialize;
use source::{installed_executable, ReminderListener, ReminderSignal};
use std::{
    cell::RefCell,
    path::{Path, PathBuf},
    rc::Rc,
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::HWND;

pub(crate) use plugin_view::plugin_messages;

use crate::win32;

static SERVICE: OnceLock<Arc<ReminderService>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSnapshot {
    revision: u64,
    enabled: bool,
    status: String,
    pending: bool,
    last_attention_at: Option<u64>,
    error: Option<String>,
    /// The newest message read from WeChat's chat list; `None` while the list is not readable.
    message: Option<ChatMessage>,
    /// Setting: switch WeChat's Qt accessibility on so its chat list can be read.
    expose_ui: bool,
    /// How that is going, for the settings; `None` while off.
    expose_status: Option<String>,
}

/// One chat with a new message, as WeChat's chat list shows it.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// What opens the chat again (`open_wechat`).
    chat: String,
    contact: String,
    /// The last message, as WeChat cuts it short; a group's starts with the sender.
    preview: String,
    unread: Option<u32>,
    /// When it was read, in ms; unique per message, so each one is its own preview.
    at: u64,
}

impl Default for ReminderSnapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            enabled: false,
            status: "disabled".into(),
            pending: false,
            last_attention_at: None,
            error: None,
            message: None,
            expose_ui: false,
            expose_status: None,
        }
    }
}

#[derive(Default)]
struct ReminderState {
    snapshot: ReminderSnapshot,
    generation: u64,
}

impl ReminderState {
    fn set_enabled(&mut self, enabled: bool) -> bool {
        if self.snapshot.enabled == enabled {
            return false;
        }
        self.generation += 1;
        self.snapshot = ReminderSnapshot {
            revision: self.snapshot.revision + 1,
            enabled,
            status: if enabled { "waiting" } else { "disabled" }.into(),
            expose_ui: self.snapshot.expose_ui,
            expose_status: self.snapshot.expose_status.take(),
            ..Default::default()
        };
        true
    }

    fn set_expose_ui(&mut self, on: bool) -> bool {
        if self.snapshot.expose_ui == on {
            return false;
        }
        self.snapshot.expose_ui = on;
        self.snapshot.revision += 1;
        true
    }

    fn set_expose_status(&mut self, status: Option<String>) -> bool {
        if self.snapshot.expose_status == status {
            return false;
        }
        self.snapshot.expose_status = status;
        self.snapshot.revision += 1;
        true
    }

    fn apply(&mut self, generation: u64, signal: ReminderSignal, now: u64) -> bool {
        if !self.snapshot.enabled || self.generation != generation {
            return false;
        }
        match signal {
            ReminderSignal::Attention if !self.snapshot.pending => {
                self.snapshot.pending = true;
                self.snapshot.last_attention_at = Some(now);
            }
            ReminderSignal::Activated if self.snapshot.pending => self.snapshot.pending = false,
            _ => return false,
        }
        self.snapshot.revision += 1;
        true
    }

    /// A message read from the chat list: pending as for a flash, plus the message to show.
    fn receive(&mut self, generation: u64, message: ChatMessage) -> bool {
        if !self.snapshot.enabled || self.generation != generation {
            return false;
        }
        if !self.snapshot.pending {
            self.snapshot.pending = true;
            self.snapshot.last_attention_at = Some(message.at);
        }
        self.snapshot.message = Some(message);
        self.snapshot.revision += 1;
        true
    }
}

struct ReminderService {
    app: AppHandle,
    state: Mutex<ReminderState>,
    /// WeChat's accessibility byte, when the island set it.
    gate: Mutex<gate::Keeper>,
    wake: mpsc::SyncSender<()>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (wake, receiver) = mpsc::sync_channel(1);
    let folder = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("wechat-gate");
    let service = Arc::new(ReminderService {
        app: app.clone(),
        state: Mutex::new(ReminderState::default()),
        gate: Mutex::new(gate::Keeper::new(folder)),
        wake,
    });
    let worker = service.clone();
    thread::Builder::new()
        .name("wechat-reminders".into())
        .spawn(move || monitor(worker, receiver))
        .map_err(|error| format!("无法启动微信提醒监听：{error}"))?;
    SERVICE
        .set(service)
        .map_err(|_| "微信提醒服务已启动。".to_string())
}

fn service() -> Result<&'static Arc<ReminderService>, String> {
    SERVICE.get().ok_or_else(|| "微信提醒服务尚未就绪。".into())
}

fn publish(service: &ReminderService, snapshot: ReminderSnapshot) {
    plugin_view::publish_received(&snapshot);
    let visible = service
        .app
        .get_webview_window("main")
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let payload = serde_json::json!({"snapshot": snapshot, "windowVisible": visible});
    let _ = service.app.emit_to(
        crate::settings_window::WINDOW_LABEL,
        "wechat-reminder-changed",
        payload.clone(),
    );
    let _ = service
        .app
        .emit_to("main", "wechat-reminder-changed", payload);
}

#[tauri::command]
pub fn get_wechat_reminder_state() -> Result<ReminderSnapshot, String> {
    Ok(service()?
        .state
        .lock()
        .map_err(|_| "微信提醒状态不可用。")?
        .snapshot
        .clone())
}

pub(crate) fn diagnostic_state() -> Result<serde_json::Value, String> {
    let state = service()?
        .state
        .lock()
        .map_err(|_| "微信提醒状态不可用。")?;
    Ok(serde_json::json!({
        "enabled": state.snapshot.enabled,
        "status": state.snapshot.status,
        "pending": state.snapshot.pending,
        "lastAttentionAt": state.snapshot.last_attention_at,
        "error": state.snapshot.error,
    }))
}

#[tauri::command]
pub fn set_wechat_reminders_enabled(enabled: bool) -> Result<ReminderSnapshot, String> {
    let service = service()?;
    let (snapshot, changed) = {
        let mut state = service.state.lock().map_err(|_| "微信提醒状态不可用。")?;
        let changed = state.set_enabled(enabled);
        (state.snapshot.clone(), changed)
    };
    if changed {
        publish(service, snapshot.clone());
        let _ = service.wake.try_send(());
    }
    Ok(snapshot)
}

/// Turns the "expose WeChat's UI" setting on or off. Off puts WeChat's byte back right away; on
/// takes effect on the listener's next round (it may scan Weixin.dll for a few seconds once).
#[tauri::command]
pub fn set_wechat_expose_ui(enabled: bool) -> Result<ReminderSnapshot, String> {
    let service = service()?;
    if !enabled {
        let _ = service.gate.lock().map(|mut gate| gate.off());
    }
    let (snapshot, changed) = {
        let mut state = service.state.lock().map_err(|_| "微信提醒状态不可用。")?;
        let mut changed = state.set_expose_ui(enabled);
        if !enabled {
            changed |= state.set_expose_status(None);
        }
        (state.snapshot.clone(), changed)
    };
    if changed {
        publish(service, snapshot.clone());
        let _ = service.wake.try_send(());
    }
    Ok(snapshot)
}

/// Puts WeChat's byte back when the island exits.
pub(crate) fn shutdown() {
    if let Some(service) = SERVICE.get() {
        let _ = service.gate.lock().map(|mut gate| gate.off());
    }
}

/// Keeps WeChat's UI exposed while the setting asks for it, and tells the settings how it goes.
/// True when the island has just exposed it.
fn keep_gate(service: &ReminderService, executable: &Path) -> bool {
    let on = service
        .state
        .lock()
        .is_ok_and(|state| state.snapshot.enabled && state.snapshot.expose_ui);
    let Ok(mut gate) = service.gate.lock() else {
        return false;
    };
    let was_on = gate.is_on();
    if !gate.tick(on, || main_window(executable)) {
        return false;
    }
    let status = gate.status.clone();
    let now_on = gate.is_on();
    drop(gate);
    let snapshot = service.state.lock().ok().and_then(|mut state| {
        state
            .set_expose_status(status)
            .then(|| state.snapshot.clone())
    });
    if let Some(snapshot) = snapshot {
        publish(service, snapshot);
    }
    now_on && !was_on
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn signal(service: &ReminderService, generation: u64, event: ReminderSignal) {
    let now = now_ms();
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !state.apply(generation, event, now) {
            return;
        }
        state.snapshot.clone()
    };
    publish(service, snapshot);
}

fn receive(service: &ReminderService, generation: u64, message: ChatMessage) {
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !state.receive(generation, message) {
            return;
        }
        state.snapshot.clone()
    };
    publish(service, snapshot);
}

/// WeChat updates its list a moment after the flash; a list that has not changed yet is read
/// again a few times before the reminder goes out without a message.
const SETTLE: Duration = Duration::from_millis(400);
const RETRY: Duration = Duration::from_millis(700);
const READS: u32 = 3;

/// Reads WeChat's chat list after flashes and compares it with the last read.
struct ChatReader {
    executable: PathBuf,
    seen: Option<Vec<chats::Session>>,
    due: Option<Instant>,
    reads: u32,
    /// Read the list again once the user has left WeChat: what changed while they were in it is
    /// not news at the next flash.
    rebase: Option<Instant>,
    in_wechat: bool,
}

impl ChatReader {
    fn new(executable: PathBuf) -> Self {
        let mut reader = Self {
            executable,
            seen: None,
            due: None,
            reads: 0,
            rebase: None,
            in_wechat: false,
        };
        reader.seen = reader.read();
        reader
    }

    fn read(&self) -> Option<Vec<chats::Session>> {
        chats::read(main_window(&self.executable)?)
    }

    fn flashed(&mut self) {
        self.rebase = None;
        if self.due.is_none() {
            // Nothing readable last time: find out now rather than hold the reminder back.
            let wait = if self.seen.is_some() {
                SETTLE
            } else {
                Duration::ZERO
            };
            self.due = Some(Instant::now() + wait);
            self.reads = 0;
        }
    }

    fn activated(&mut self, in_wechat: bool) {
        let left = std::mem::replace(&mut self.in_wechat, in_wechat) && !in_wechat;
        if left && self.due.is_none() {
            self.rebase = Some(Instant::now() + SETTLE);
        }
    }

    /// The chats with a new message once a flash's reads are done (empty: none could be told, so
    /// the plain reminder shows); `None` while there is nothing to report yet.
    fn tick(&mut self) -> Option<Vec<chats::Session>> {
        let now = Instant::now();
        if self.rebase.is_some_and(|at| now >= at) {
            self.rebase = None;
            if let Some(rows) = self.read() {
                self.seen = Some(rows);
            }
        }
        if !self.due.is_some_and(|at| now >= at) {
            return None;
        }
        let fresh = match (self.read(), self.seen.take()) {
            (Some(rows), Some(before)) => {
                let fresh: Vec<_> = chats::new_messages(&before, &rows)
                    .into_iter()
                    .cloned()
                    .collect();
                self.seen = Some(rows);
                fresh
            }
            // Not readable, or the first readable list, which is only the baseline.
            (rows, before) => {
                self.seen = rows.or(before);
                self.due = None;
                return Some(Vec::new());
            }
        };
        self.reads += 1;
        if fresh.is_empty() && self.reads < READS {
            self.due = Some(now + RETRY);
            return None;
        }
        self.due = None;
        Some(fresh)
    }
}

fn connection(service: &ReminderService, generation: u64, error: Option<String>) {
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !state.snapshot.enabled || state.generation != generation {
            return;
        }
        let status = if error.is_some() {
            "error"
        } else {
            "listening"
        };
        if state.snapshot.status == status && state.snapshot.error == error {
            return;
        }
        state.snapshot.status = status.into();
        state.snapshot.error = error;
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot);
}

fn monitor(service: Arc<ReminderService>, receiver: mpsc::Receiver<()>) {
    loop {
        let (enabled, generation) = match service.state.lock() {
            Ok(state) => (state.snapshot.enabled, state.generation),
            Err(_) => return,
        };
        if !enabled {
            if receiver.recv().is_err() {
                return;
            }
            continue;
        }
        let events = Rc::new(RefCell::new(Vec::new()));
        let sink = events.clone();
        let listener = installed_executable().and_then(|executable| {
            ReminderListener::new(executable.clone(), move |event| {
                sink.borrow_mut().push(event)
            })
            .map(|listener| (listener, executable))
        });
        match listener {
            Ok((listener, executable)) => {
                connection(&service, generation, None);
                let mut reader = ChatReader::new(executable);
                loop {
                    if !service
                        .state
                        .lock()
                        .is_ok_and(|state| state.snapshot.enabled && state.generation == generation)
                    {
                        // Reminders off: WeChat's UI goes back to hidden too.
                        keep_gate(&service, &reader.executable);
                        break;
                    }
                    if keep_gate(&service, &reader.executable) {
                        // Readable from now on: take the list as it is as the baseline.
                        reader.seen = reader.read();
                    }
                    listener.poll();
                    let _ = listener.stats();
                    for event in events.take() {
                        match event {
                            ReminderSignal::Attention => reader.flashed(),
                            ReminderSignal::ActivatedElsewhere => reader.activated(false),
                            ReminderSignal::Activated => {
                                reader.activated(true);
                                signal(&service, generation, event);
                            }
                            _ => signal(&service, generation, event),
                        }
                    }
                    match reader.tick() {
                        Some(fresh) if fresh.is_empty() => {
                            signal(&service, generation, ReminderSignal::Attention)
                        }
                        Some(fresh) => {
                            let at = now_ms();
                            for (index, chat) in fresh.into_iter().enumerate() {
                                let message = ChatMessage {
                                    chat: chat.key,
                                    contact: chat.contact,
                                    preview: chat.preview,
                                    unread: chat.unread,
                                    at: at + index as u64,
                                };
                                receive(&service, generation, message);
                            }
                        }
                        None => {}
                    }
                    if receiver.recv_timeout(Duration::from_millis(50))
                        == Err(mpsc::RecvTimeoutError::Disconnected)
                    {
                        return;
                    }
                }
            }
            Err(error) => {
                connection(&service, generation, Some(error));
                if receiver.recv_timeout(Duration::from_secs(5))
                    == Err(mpsc::RecvTimeoutError::Disconnected)
                {
                    return;
                }
            }
        }
    }
}

/// Brings WeChat up; with `chat` (a `ChatMessage`'s) it also opens that chat when its row is in
/// view, otherwise WeChat stays on the chat it showed last.
#[tauri::command]
pub async fn open_wechat(chat: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let executable = installed_executable()?;
        if activate_existing_wechat(&executable)? {
            if let Some(chat) = chat {
                // A window just restored lays its list out a moment later.
                thread::sleep(Duration::from_millis(300));
                let opened = main_window(&executable)
                    .ok_or("no main window")
                    .and_then(|window| chats::open(window, &chat));
                if let Err(why) = opened {
                    eprintln!("WeChat reminders: could not open the chat ({why}); WeChat shows its last chat");
                }
            }
            return Ok(());
        }
        Err("未找到正在运行的微信窗口，请先打开并登录桌面版微信。".into())
    })
    .await
    .map_err(|error| format!("打开微信的线程失败：{error}"))?
}

struct WeChatWindow {
    handle: HWND,
    started_at: u64,
    main_sized: bool,
    visible: bool,
}

struct WindowSearch {
    executable: String,
    found: Vec<WeChatWindow>,
    running: bool,
}

fn preferred_window(windows: &[WeChatWindow]) -> Option<&WeChatWindow> {
    // Only full main windows qualify; prefer the visible window, then the older instance.
    windows
        .iter()
        .filter(|window| window.main_sized)
        .min_by_key(|window| (!window.visible, window.started_at))
}

fn find_wechat_window(search: &mut WindowSearch, window: HWND) {
    let process_id = win32::process::window_process_id(window);
    let Some(path) = win32::process::image_path(process_id) else {
        return;
    };
    if !path.eq_ignore_ascii_case(&search.executable) {
        return;
    }
    let started_at = win32::process_times::start_time(process_id).unwrap_or(u64::MAX);
    search.running = true;
    let title = win32::window::window_text(window, 32);
    if !["微信", "WeChat", "Weixin"].contains(&title.as_str()) {
        return;
    }
    let main_sized = win32::window::normal_position(window).is_some_and(|position| {
        position.right - position.left >= 500 && position.bottom - position.top >= 300
    });
    search.found.push(WeChatWindow {
        handle: window,
        started_at,
        main_sized,
        visible: win32::window::is_visible(window),
    });
}

fn main_window(executable: &Path) -> Option<HWND> {
    let search = existing_wechat_windows(executable).ok()?;
    preferred_window(&search.found).map(|window| window.handle)
}

fn existing_wechat_windows(executable: &std::path::Path) -> Result<WindowSearch, String> {
    let mut search = WindowSearch {
        executable: executable.to_string_lossy().into_owned(),
        found: Vec::new(),
        running: false,
    };
    win32::window::for_each_top_level_window(|window| find_wechat_window(&mut search, window))
        .map_err(|error| format!("无法查找已运行的微信窗口：{error}"))?;
    Ok(search)
}

fn activate_existing_wechat(executable: &std::path::Path) -> Result<bool, String> {
    let search = existing_wechat_windows(executable)?;
    if !search.running {
        return Ok(false);
    }
    let original = preferred_window(&search.found)
        .ok_or("微信已在运行，但未定位到主窗口，请先从系统托盘打开并登录微信。")?;
    let expected_process = win32::process::window_process_id(original.handle);
    // The registered handler restores Qt's own UI state. Showing its HWND directly can leave it blank.
    tauri_plugin_opener::open_url("weixin://", None::<&str>).map_err(|error| {
        format!("无法通过微信注册入口唤回客户端，请从系统托盘打开微信：{error}")
    })?;
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(50));
        let current = existing_wechat_windows(executable)?;
        if let Some(window) = preferred_window(&current.found) {
            let process_id = win32::process::window_process_id(window.handle);
            if process_id == expected_process
                && window.visible
                && !win32::window::is_minimized(window.handle)
            {
                return Ok(true);
            }
        }
    }
    Err("微信未能恢复原来的主窗口，请双击系统托盘中的微信图标。".into())
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::wechat_reminders::get_wechat_reminder_state,
            crate::wechat_reminders::set_wechat_reminders_enabled,
            crate::wechat_reminders::open_wechat,
            crate::wechat_reminders::set_wechat_expose_ui,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
