//! Taking Win+V from Windows' clipboard history (C22.3). Explorer owns Win+V through
//! RegisterHotKey, so registering it again fails; a low-level keyboard hook sees the key first and
//! can swallow it, as EcoPaste does. Nothing in the registry changes and Explorer is not restarted:
//! removing the hook gives Win+V back at once. The same hook also reports each Ctrl+V the user
//! presses while a paste sequence runs (C24.7), so the next entry can go on the clipboard.

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
/// The window and message the hook posts for each Win+V; 0 while Win+V is Windows'.
static TARGET_WINDOW: AtomicIsize = AtomicIsize::new(0);
static TARGET_MESSAGE: AtomicU32 = AtomicU32::new(0);
/// The window and message posted when the user releases Ctrl+V; 0 while no sequence runs.
static PASTE_WINDOW: AtomicIsize = AtomicIsize::new(0);
static PASTE_MESSAGE: AtomicU32 = AtomicU32::new(0);
/// A V press was swallowed, so its release is swallowed too (the app under it saw no press).
static SWALLOWING_V: AtomicBool = AtomicBool::new(false);

fn post(window: isize, message: u32) {
    if window != 0 {
        // SAFETY: posts a message with zero parameters, so no pointer crosses over; a window that
        // went away only makes the post fail.
        let _ = unsafe { PostMessageW(Some(HWND(window as *mut core::ffi::c_void)), message, WPARAM(0), LPARAM(0)) };
    }
}

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
            // The user pasted (the app read the clipboard on the press); never swallowed.
            if !pressed && is_down(VK_CONTROL) {
                post(PASTE_WINDOW.load(Ordering::SeqCst), PASTE_MESSAGE.load(Ordering::SeqCst));
            }
            let win = is_down(VK_LWIN) || is_down(VK_RWIN);
            if pressed && TARGET_WINDOW.load(Ordering::SeqCst) != 0 && is_win_v(event.vkCode, win, is_down(VK_CONTROL) || is_down(VK_MENU)) {
                // Auto-repeat while held opens nothing more, but stays swallowed.
                if !SWALLOWING_V.swap(true, Ordering::SeqCst) {
                    send_key_down(MASK_KEY);
                    send_key_up(MASK_KEY);
                    post(TARGET_WINDOW.load(Ordering::SeqCst), TARGET_MESSAGE.load(Ordering::SeqCst));
                }
                return LRESULT(1);
            }
        }
    }
    // SAFETY: passes the hook's own arguments on unchanged; the hook handle is ignored since Vista.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn store(target: Option<(HWND, u32)>, window: &AtomicIsize, message: &AtomicU32) {
    let (handle, id) = target.map_or((0, 0), |(handle, id)| (handle.0 as isize, id));
    window.store(handle, Ordering::SeqCst);
    message.store(id, Ordering::SeqCst);
}

/// Sets what the hook does: post `win_v`'s message on each Win+V and keep the key from Windows,
/// and post `paste`'s message on each Ctrl+V the user releases. The hook runs while either is set
/// and is removed when neither is. Must run on a thread with a message loop (the hook is called on
/// it), and the callback must stay quick: Windows drops hooks that take too long.
pub(crate) fn set(win_v: Option<(HWND, u32)>, paste: Option<(HWND, u32)>) -> windows::core::Result<()> {
    store(win_v, &TARGET_WINDOW, &TARGET_MESSAGE);
    store(paste, &PASTE_WINDOW, &PASTE_MESSAGE);
    if win_v.is_none() {
        SWALLOWING_V.store(false, Ordering::SeqCst);
    }
    let mut hook = HOOK.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    match (win_v.is_some() || paste.is_some(), hook.is_some()) {
        (true, false) => {
            // SAFETY: keyboard_proc matches HOOKPROC and lives for the whole program; a
            // low-level hook needs no module handle or thread id.
            let handle = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) }?;
            *hook = Some(handle.0 as isize);
        }
        (false, true) => {
            if let Some(handle) = hook.take() {
                // SAFETY: the handle came from SetWindowsHookExW above and is removed only once.
                let _ = unsafe { UnhookWindowsHookEx(HHOOK(handle as *mut core::ffi::c_void)) };
            }
        }
        _ => {}
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
