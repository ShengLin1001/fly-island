//! Clipboard change notifications (`WM_CLIPBOARDUPDATE`), and the marks password managers put on
//! what they copy.

use windows::{
    core::{w, Result, PCWSTR},
    Win32::{
        Foundation::{HGLOBAL, HWND},
        System::{
            DataExchange::{
                AddClipboardFormatListener, CloseClipboard, EmptyClipboard, GetClipboardData,
                IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
                RemoveClipboardFormatListener,
            },
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
    },
};

/// Sends `WM_CLIPBOARDUPDATE` to `window` whenever the clipboard changes.
pub(crate) fn add_format_listener(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value and fails for invalid windows.
    unsafe { AddClipboardFormatListener(window) }
}

pub(crate) fn remove_format_listener(window: HWND) -> Result<()> {
    // SAFETY: takes the HWND by value; fails harmlessly if not registered.
    unsafe { RemoveClipboardFormatListener(window) }
}

/// Removes whatever is on the clipboard. Used to put back an empty clipboard.
pub(crate) fn empty() -> Result<()> {
    // SAFETY: OpenClipboard(None) claims the clipboard for this thread and fails if
    // another owner holds it. EmptyClipboard and CloseClipboard are the matching
    // calls; none of them read caller memory. Close runs even when emptying fails.
    unsafe {
        OpenClipboard(None)?;
        let emptied = EmptyClipboard();
        CloseClipboard()?;
        emptied
    }
}

fn format_id(name: PCWSTR) -> u32 {
    // SAFETY: `name` comes from w!, a static NUL-terminated UTF-16 string.
    unsafe { RegisterClipboardFormatW(name) }
}

fn has_format(format: u32) -> bool {
    // SAFETY: takes a format id by value and reads no caller memory.
    format != 0 && unsafe { IsClipboardFormatAvailable(format) }.is_ok()
}

/// Whether what is on the clipboard asks to stay out of clipboard history: the formats password
/// managers (KeePass, Bitwarden, 1Password...) add next to a password, as Windows' own history
/// honours them (https://learn.microsoft.com/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats).
pub(crate) fn is_marked_private() -> bool {
    if has_format(format_id(w!("ExcludeClipboardContentFromMonitorProcessing")))
        || has_format(format_id(w!("Clipboard Viewer Ignore")))
    {
        return true;
    }
    // A DWORD 0 here means "not for clipboard history"; anything else allows it.
    let history = format_id(w!("CanIncludeInClipboardHistory"));
    has_format(history) && read_dword(history) == Some(0)
}

fn read_dword(format: u32) -> Option<u32> {
    // SAFETY: OpenClipboard(None) claims the clipboard for this thread and CloseClipboard below
    // releases it on every path. The handle GetClipboardData returns belongs to the clipboard and
    // stays valid while it is open; it is read only between GlobalLock and GlobalUnlock, and only
    // when GlobalSize says it holds at least four bytes. read_unaligned copes with any alignment.
    unsafe {
        OpenClipboard(None).ok()?;
        let value = GetClipboardData(format).ok().and_then(|handle| {
            let global = HGLOBAL(handle.0);
            if GlobalSize(global) < std::mem::size_of::<u32>() {
                return None;
            }
            let pointer = GlobalLock(global) as *const u32;
            if pointer.is_null() {
                return None;
            }
            let value = pointer.read_unaligned();
            let _ = GlobalUnlock(global);
            Some(value)
        });
        let _ = CloseClipboard();
        value
    }
}
