//! Taking another app's window off the taskbar and putting it back (ITaskbarList). WeChat
//! reminders use it so a minimized WeChat, whose chat list stays readable, takes no taskbar room.

use windows::Win32::{
    Foundation::HWND,
    System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
    UI::Shell::{ITaskbarList, TaskbarList},
};

use super::com::ComApartment;

/// Shows (`true`) or removes (`false`) the taskbar button of `window`; false when that failed.
pub(crate) fn set_button(window: HWND, shown: bool) -> bool {
    if window.is_invalid() {
        return false;
    }
    // A thread already in a single-threaded apartment can still use the taskbar list.
    let _com = ComApartment::multithreaded().ok();
    // SAFETY: COM is initialized on this thread (above) for the whole call; the interface is an
    // owned, reference-counted value used only here, and the HWND is passed by value (the
    // taskbar ignores windows that do not exist).
    let done = unsafe {
        CoCreateInstance::<_, ITaskbarList>(&TaskbarList, None, CLSCTX_INPROC_SERVER).and_then(
            |list| {
                list.HrInit()?;
                if shown {
                    list.AddTab(window)
                } else {
                    list.DeleteTab(window)
                }
            },
        )
    };
    done.is_ok()
}
