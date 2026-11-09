//! The clipboard listener: a message-only window for WM_CLIPBOARDUPDATE and the shortcut's
//! WM_HOTKEY, falling back to polling, and the worker that captures each change.

use std::{
    sync::{
        mpsc::{self, SyncSender},
        Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_CLIPBOARDUPDATE, WM_HOTKEY},
};

use super::hotkey::{
    refresh_registered_hotkey, unregister_current_hotkey, CLIPBOARD_HOTKEY_WINDOW, HOTKEY_ID,
    HOTKEY_REFRESH_MESSAGE, PASTED_MESSAGE, WIN_V_MESSAGE,
};
use super::service;
use crate::win32::{
    self,
    message_window::{self, WindowMessages},
};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

static CLIPBOARD_NOTIFY_TX: OnceLock<Mutex<Option<SyncSender<()>>>> = OnceLock::new();

pub(super) fn start_workers() {
    // Clipboard reads can block while another process owns the clipboard. Keep at most one
    // pending read so a busy clipboard cannot build an unbounded backlog of work.
    let (tx, rx) = mpsc::sync_channel::<()>(1);
    let _ = CLIPBOARD_NOTIFY_TX.set(Mutex::new(Some(tx)));

    thread::spawn(move || {
        while rx.recv().is_ok() {
            if let Ok(service) = service() {
                service.capture_current_clipboard();
            }
        }
    });

    thread::spawn(|| {
        if let Err(error) = run_windows_clipboard_listener() {
            eprintln!("clipboard listener fell back to polling only: {error}");

            loop {
                thread::sleep(POLL_INTERVAL);
                notify_clipboard_changed();
            }
        }
    });
}

pub(super) fn notify_clipboard_changed() {
    if let Some(sender) = CLIPBOARD_NOTIFY_TX
        .get()
        .and_then(|sender| sender.lock().ok())
        .and_then(|sender| sender.as_ref().cloned())
    {
        let _ = sender.try_send(());
    }
}

fn run_windows_clipboard_listener() -> Result<(), String> {
    let class_name = "FocuSDClipboardHistoryListener";
    let instance = message_window::module_instance().map_err(|error| error.to_string())?;

    if message_window::register_class::<ClipboardWindow>(instance, class_name).is_err() {
        return Err("Failed to register clipboard listener window class.".to_string());
    }

    let hwnd = message_window::create_message_only_window(
        instance,
        class_name,
        "FocuSD Clipboard History Listener",
    )
    .map_err(|error| error.to_string())?;

    win32::clipboard::add_format_listener(hwnd).map_err(|error| error.to_string())?;
    if let Some(window) = CLIPBOARD_HOTKEY_WINDOW.get() {
        if let Ok(mut stored_window) = window.lock() {
            *stored_window = Some(hwnd.0 as isize);
        }
    } else {
        let _ = CLIPBOARD_HOTKEY_WINDOW.set(Mutex::new(Some(hwnd.0 as isize)));
    }
    refresh_registered_hotkey(hwnd);

    message_window::run_message_loop();

    unregister_current_hotkey(hwnd);
    let _ = win32::clipboard::remove_format_listener(hwnd);

    Ok(())
}

struct ClipboardWindow;

impl WindowMessages for ClipboardWindow {
    fn handle(hwnd: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        if message == WM_CLIPBOARDUPDATE {
            notify_clipboard_changed();
            return Some(LRESULT(0));
        }

        if (message == WM_HOTKEY && wparam.0 == HOTKEY_ID as usize) || message == WIN_V_MESSAGE {
            if let Ok(service) = service() {
                service.emit_shortcut();
            }
            return Some(LRESULT(0));
        }

        if message == PASTED_MESSAGE {
            super::sequence::advance();
            return Some(LRESULT(0));
        }

        if message == HOTKEY_REFRESH_MESSAGE {
            refresh_registered_hotkey(hwnd);
            return Some(LRESULT(0));
        }

        None
    }
}
