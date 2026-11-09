//! Taking Win+V from Windows' clipboard history (C22.3). Explorer owns Win+V through
//! RegisterHotKey, so registering it again fails; a low-level keyboard hook sees the key first and
//! can swallow it, as EcoPaste does. Nothing in the registry changes and Explorer is not restarted:
//! removing the hook gives Win+V back at once.

use std::sync::{
    atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering},
    Mutex,
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN,
        },
        WindowsAndMessaging::{
            CallNextHookEx, PostMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION, HHOOK,
            KBDLLHOOKSTRUCT, LLKHF_INJECTED, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
        },
    },
};

use super::input::{send_key_down, send_key_up};

/// An unassigned virtual key: tapping it while Win is held makes Windows treat Win as part of a
/// combination, so releasing Win does not open the Start menu.
const MASK_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);
const KEY_V: u32 = b'V' as u32;

static HOOK: Mutex<Option<isize>> = Mutex::new(None);
/// The window and message the hook posts for each Win+V.
static TARGET_WINDOW: AtomicIsize = AtomicIsize::new(0);
static TARGET_MESSAGE: AtomicU32 = AtomicU32::new(0);
/// A V press was swallowed, so its release is swallowed too (the app under it saw no press).
static SWALLOWING_V: AtomicBool = AtomicBool::new(false);

fn is_down(key: VIRTUAL_KEY) -> bool {
    // SAFETY: GetAsyncKeyState takes a key code by value and reads no caller memory.
    (unsafe { GetAsyncKeyState(i32::from(key.0)) } as u16 & 0x8000) != 0
}

/// Whether a key event is the V of a plain Win+V (no Ctrl or Alt: those are other shortcuts).
pub(crate) fn is_win_v(vk_code: u32, win_down: bool, ctrl_or_alt_down: bool) -> bool {
    vk_code == KEY_V && win_down && !ctrl_or_alt_down
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for WH_KEYBOARD_LL with HC_ACTION, lparam points to a KBDLLHOOKSTRUCT that the
        // system keeps valid for the duration of this call.
        let event = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let injected = event.flags.0 & LLKHF_INJECTED.0 != 0;
        if event.vkCode == KEY_V && !injected {
            let pressed = wparam.0 as u32 == WM_KEYDOWN || wparam.0 as u32 == WM_SYSKEYDOWN;
            if !pressed && SWALLOWING_V.swap(false, Ordering::SeqCst) {
                return LRESULT(1);
            }
            let win = is_down(VK_LWIN) || is_down(VK_RWIN);
            if pressed && is_win_v(event.vkCode, win, is_down(VK_CONTROL) || is_down(VK_MENU)) {
                // Auto-repeat while held opens nothing more, but stays swallowed.
                if !SWALLOWING_V.swap(true, Ordering::SeqCst) {
                    send_key_down(MASK_KEY);
                    send_key_up(MASK_KEY);
                    let window = TARGET_WINDOW.load(Ordering::SeqCst);
                    if window != 0 {
                        // SAFETY: posts a message with zero parameters, so no pointer crosses over;
                        // a window that went away only makes the post fail.
                        let _ = unsafe {
                            PostMessageW(
                                Some(HWND(window as *mut core::ffi::c_void)),
                                TARGET_MESSAGE.load(Ordering::SeqCst),
                                WPARAM(0),
                                LPARAM(0),
                            )
                        };
                    }
                }
                return LRESULT(1);
            }
        }
    }
    // SAFETY: passes the hook's own arguments on unchanged; the hook handle is ignored since Vista.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// Installs the hook, which posts `message` to `window` on each Win+V and keeps the key from
/// Windows; `None` removes it. Must run on a thread with a message loop (the hook is called on it),
/// and the callback must stay quick: Windows drops hooks that take too long.
pub(crate) fn set(target: Option<(HWND, u32)>) -> windows::core::Result<()> {
    let mut hook = HOOK.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    match target {
        Some((window, message)) => {
            TARGET_WINDOW.store(window.0 as isize, Ordering::SeqCst);
            TARGET_MESSAGE.store(message, Ordering::SeqCst);
            if hook.is_none() {
                // SAFETY: keyboard_proc matches HOOKPROC and lives for the whole program; a
                // low-level hook needs no module handle or thread id.
                let handle = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) }?;
                *hook = Some(handle.0 as isize);
            }
        }
        None => {
            if let Some(handle) = hook.take() {
                // SAFETY: the handle came from SetWindowsHookExW above and is removed only once.
                let _ = unsafe { UnhookWindowsHookEx(HHOOK(handle as *mut core::ffi::c_void)) };
            }
            TARGET_WINDOW.store(0, Ordering::SeqCst);
            SWALLOWING_V.store(false, Ordering::SeqCst);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_win_v;

    #[test]
    fn only_a_plain_win_v_is_taken() {
        assert!(is_win_v(u32::from(b'V'), true, false));
        assert!(!is_win_v(u32::from(b'V'), false, false));
        assert!(!is_win_v(u32::from(b'V'), true, true));
        assert!(!is_win_v(u32::from(b'C'), true, false));
    }
}
