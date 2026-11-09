//! The "minimized WeChat leaves the taskbar" setting. Closed to the tray, WeChat hides its window
//! and Qt then shows no chat list at all; minimized, the list stays readable. Taking a minimized
//! WeChat's button off the taskbar makes minimizing look like closing to the tray.

use std::time::{Duration, Instant};
use windows::Win32::Foundation::HWND;

use crate::win32;

/// How often WeChat's window is checked, and looked for again when it has gone.
const POLL: Duration = Duration::from_millis(500);
const SEARCH: Duration = Duration::from_secs(5);

/// What to do with WeChat's taskbar button: `Some(false)` remove it, `Some(true)` put it back.
fn step(removed: bool, visible: bool, minimized: bool) -> Option<bool> {
    match (removed, visible && minimized) {
        (false, true) => Some(false),
        // Hidden (closed to the tray) is left alone: the taskbar adds the button when it shows.
        (true, false) if visible => Some(true),
        _ => None,
    }
}

/// HWNDs are kept as numbers so the keeper can sit in the service's Mutex.
#[derive(Default)]
pub(super) struct Keeper {
    window: Option<isize>,
    removed: bool,
    next: Option<Instant>,
    search: Option<Instant>,
}

fn handle(raw: isize) -> HWND {
    HWND(raw as *mut _)
}

fn alive(window: HWND) -> bool {
    win32::process::window_process_id(window) != 0
}

impl Keeper {
    pub(super) fn tick(&mut self, on: bool, find: impl FnOnce() -> Option<HWND>) {
        if !on {
            self.restore();
            return;
        }
        let now = Instant::now();
        if self.next.is_some_and(|at| now < at) {
            return;
        }
        self.next = Some(now + POLL);
        let window = match self.window.map(handle).filter(|window| alive(*window)) {
            Some(window) => window,
            None => {
                self.removed = false;
                if self.search.is_some_and(|at| now < at) {
                    return;
                }
                self.search = Some(now + SEARCH);
                let Some(window) = find() else {
                    self.window = None;
                    return;
                };
                self.window = Some(window.0 as isize);
                window
            }
        };
        let visible = win32::window::is_visible(window);
        let minimized = win32::window::is_minimized(window);
        if let Some(shown) = step(self.removed, visible, minimized) {
            if win32::taskbar::set_button(window, shown) {
                self.removed = !shown;
            }
        }
    }

    /// Puts the button back (setting off, reminders off, island exiting).
    pub(super) fn restore(&mut self) {
        if let Some(window) = self.window.map(handle) {
            if self.removed && alive(window) && win32::window::is_visible(window) {
                win32::taskbar::set_button(window, true);
            }
        }
        self.removed = false;
    }
}

#[cfg(test)]
mod tests {
    use super::step;

    #[test]
    fn minimized_leaves_the_taskbar_and_comes_back_once_restored() {
        assert_eq!(step(false, true, true), Some(false));
        assert_eq!(step(true, true, true), None);
        assert_eq!(step(true, true, false), Some(true));
        assert_eq!(step(false, true, false), None);
        // Hidden in the tray: nothing to do either way.
        assert_eq!(step(true, false, false), None);
        assert_eq!(step(false, false, false), None);
    }
}
