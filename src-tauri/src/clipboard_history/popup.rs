//! The clipboard window (C22.2): pops up by the pointer on the shortcut, and pastes what the user
//! picks into the window that was in front, as Ditto does: the window takes the focus for the
//! search box and the keys, then hands it back and sends Ctrl+V.

use std::{
    path::Path,
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Position, WebviewWindow};
use windows::Win32::Foundation::HWND;

use super::{service, ClipboardHistoryItemKind, CopyAs, PopupPosition};
use crate::win32;

pub(crate) const WINDOW_LABEL: &str = "clipboard";
/// Mirrored by `CLIPBOARD_POPUP_OPENED_EVENT` in src/features/clipboard/api.ts.
const OPENED_EVENT: &str = "clipboard-popup-opened";
/// Gap between the pointer and the window's corner.
const POINTER_GAP: i32 = 12;
/// Time for the window that gets the focus back to take keys again before Ctrl+V arrives.
const FOCUS_SETTLE: Duration = Duration::from_millis(70);

/// The window that was in front when the popup opened, as an HWND value.
static TARGET_WINDOW: Mutex<Option<isize>> = Mutex::new(None);

/// Terminals whose image paste goes as a path (Claude Code and other CLIs read it as an image).
const TERMINAL_PROCESSES: &[&str] = &[
    "windowsterminal.exe",
    "openconsole.exe",
    "conhost.exe",
    "wezterm-gui.exe",
    "alacritty.exe",
    "mintty.exe",
    "tabby.exe",
    "hyper.exe",
    "warp.exe",
    "kitty.exe",
    "ghostty.exe",
];

pub(super) fn is_terminal_process(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    TERMINAL_PROCESSES.contains(&name.as_str())
}

/// Where the popup's top-left goes for a pointer at `pointer` on a work area `(left, top, right,
/// bottom)`: below and right of the pointer, flipped to the other side when it would not fit.
pub(super) fn place_by_pointer(pointer: (i32, i32), size: (i32, i32), area: (i32, i32, i32, i32), gap: i32) -> (i32, i32) {
    let (left, top, right, bottom) = area;
    let mut x = pointer.0 + gap;
    let mut y = pointer.1 + gap;
    if x + size.0 > right {
        x = pointer.0 - gap - size.0;
    }
    if y + size.1 > bottom {
        y = pointer.1 - gap - size.1;
    }
    (x.clamp(left, (right - size.0).max(left)), y.clamp(top, (bottom - size.1).max(top)))
}

fn popup_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "The clipboard window is missing.".to_string())
}

/// Shows the popup, remembering the window in front to paste into later; the shortcut again closes it.
pub(super) fn toggle(app: &AppHandle, position: PopupPosition) -> Result<(), String> {
    let window = popup_window(app)?;
    if window.is_visible().unwrap_or(false) {
        return hide(app);
    }
    // Opening the window again ends a paste sequence still running (C24.7).
    super::sequence::stop();
    let foreground = win32::window::foreground_window();
    let own = window.hwnd().map(|hwnd| hwnd.0 as isize).unwrap_or_default();
    if let Ok(mut target) = TARGET_WINDOW.lock() {
        *target = (!foreground.is_invalid() && foreground.0 as isize != own).then_some(foreground.0 as isize);
    }

    let size = window.outer_size().map_err(|error| error.to_string())?;
    let size = (size.width as i32, size.height as i32);
    let pointer = win32::window::cursor_position().map(|point| (point.x, point.y));
    let monitor = match pointer {
        Some((x, y)) => app.monitor_from_point(f64::from(x), f64::from(y)).ok().flatten(),
        None => None,
    }
    .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let work = monitor.work_area();
        let area = (
            work.position.x,
            work.position.y,
            work.position.x + work.size.width as i32,
            work.position.y + work.size.height as i32,
        );
        let scale = monitor.scale_factor();
        let (x, y) = match (position, pointer) {
            (PopupPosition::Cursor, Some(pointer)) => place_by_pointer(pointer, size, area, (f64::from(POINTER_GAP) * scale) as i32),
            _ => (area.0 + (area.2 - area.0 - size.0) / 2, area.1 + (area.3 - area.1 - size.1) / 3),
        };
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    }
    let _ = window.emit_to(WINDOW_LABEL, OPENED_EVENT, ());
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    if let Ok(hwnd) = window.hwnd() {
        let _ = win32::window::activate_from_background(hwnd);
    }
    Ok(())
}

pub(super) fn hide(app: &AppHandle) -> Result<(), String> {
    popup_window(app)?.hide().map_err(|error| error.to_string())
}

fn take_target() -> Option<HWND> {
    TARGET_WINDOW
        .lock()
        .ok()
        .and_then(|mut target| target.take())
        .map(|value| HWND(value as *mut core::ffi::c_void))
}

/// Puts the entry on the clipboard, closes the popup and, with auto-paste on, pastes it into the
/// window that was in front. An image or files go as their path into a terminal when that is on;
/// `plain` drops the formatting (C24.4).
pub(super) fn paste(app: &AppHandle, id: &str, plain: bool) -> Result<(), String> {
    let service = service()?;
    let snapshot = service.snapshot()?;
    let settings = &snapshot.settings;
    let is_image = snapshot
        .items
        .iter()
        .find(|item| item.id == id)
        .is_some_and(|item| matches!(item.kind, ClipboardHistoryItemKind::Image | ClipboardHistoryItemKind::Files));
    let target = take_target();
    let into_terminal = target.is_some_and(|window| {
        win32::process::image_path(win32::process::window_process_id(window)).is_some_and(|path| is_terminal_process(&path))
    });
    let copy_as = if is_image && settings.auto_paste && settings.terminal_image_path && into_terminal {
        CopyAs::Path
    } else if plain {
        CopyAs::Plain
    } else {
        CopyAs::Original
    };
    service.copy_item_as(id, copy_as)?;
    hide(app)?;
    paste_into(target, settings.auto_paste);
    Ok(())
}

/// Puts `text` on the clipboard (not into the history) and pastes it like an entry (C24.6).
pub(super) fn paste_text(app: &AppHandle, text: &str) -> Result<(), String> {
    let auto_paste = service()?.snapshot()?.settings.auto_paste;
    super::suspend_clipboard_capture(Duration::from_millis(800));
    super::clipboard_io::write_clipboard_text(text)?;
    hide(app)?;
    paste_into(take_target(), auto_paste);
    Ok(())
}

/// Hands the focus back to `target` and sends Ctrl+V there, when auto-paste is on.
fn paste_into(target: Option<HWND>, auto_paste: bool) {
    let (Some(target), true) = (target, auto_paste) else {
        return;
    };
    // An HWND is not Send; the thread rebuilds it from the value.
    let target = target.0 as isize;
    thread::spawn(move || {
        if win32::window::force_foreground(HWND(target as *mut core::ffi::c_void)) {
            thread::sleep(FOCUS_SETTLE);
            win32::input::send_paste_shortcut();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{is_terminal_process, place_by_pointer};

    #[test]
    fn terminals_are_told_by_their_executable() {
        assert!(is_terminal_process(r"C:\Program Files\WindowsApps\Microsoft.WindowsTerminal\WindowsTerminal.exe"));
        assert!(is_terminal_process("wezterm-gui.exe"));
        assert!(!is_terminal_process(r"C:\Windows\explorer.exe"));
        assert!(!is_terminal_process(""));
    }

    #[test]
    fn the_popup_stays_on_the_work_area() {
        let area = (0, 0, 1920, 1040);
        assert_eq!(place_by_pointer((100, 100), (380, 480), area, 12), (112, 112));
        // Near the right and bottom edges it flips to the pointer's other side.
        assert_eq!(place_by_pointer((1900, 1000), (380, 480), area, 12), (1508, 508));
        // A window larger than the area still starts on it.
        assert_eq!(place_by_pointer((10, 10), (2000, 480), area, 12), (0, 22));
    }
}
