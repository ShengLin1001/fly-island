//! Rows of another app's lists through UI Automation, and a real click on one. WeChat 4.x (Qt)
//! names each row of its chat list `session_item_<chat>`, with the contact, unread count, last
//! message and time as the row's name; it shows these only once something has switched Qt's
//! accessibility on (a screen reader, or the gate plugin), otherwise the window has no lists.

use windows::{
    core::Interface,
    Win32::{
        Foundation::{HWND, POINT},
        System::{
            Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
            Variant::VARIANT,
        },
        UI::{
            Accessibility::{
                CUIAutomation8, IUIAutomation, IUIAutomation2, TreeScope_Children,
                TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_ListControlTypeId,
                UIA_ListItemControlTypeId,
            },
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
                MOUSEINPUT,
            },
            WindowsAndMessaging::{GetAncestor, SetCursorPos, WindowFromPoint, GA_ROOT},
        },
    },
};

use super::{com::ComApartment, window};

/// How long one UI Automation call may wait for the other app before giving up.
const TIMEOUT_MS: u32 = 1000;

pub(crate) struct ListRow {
    pub id: String,
    pub name: String,
    /// The row's middle on screen; `None` while it is scrolled out of view.
    pub center: Option<POINT>,
}

/// The items of every list in `window` whose AutomationId starts with `prefix`, top to bottom.
/// `None` when the window shows no lists at all (its UI is not exposed) or UI Automation fails.
pub(crate) fn list_rows(window: HWND, prefix: &str) -> Option<Vec<ListRow>> {
    if window.is_invalid() {
        return None;
    }
    // A thread already in a single-threaded apartment can still use UI Automation.
    let _com = ComApartment::multithreaded().ok();
    read(window, prefix).ok().flatten()
}

fn read(window: HWND, prefix: &str) -> windows::core::Result<Option<Vec<ListRow>>> {
    // SAFETY: COM is initialized on this thread (above) for the whole call; every interface here
    // is an owned, reference-counted value used only within it, and the HWND is passed by value
    // (UI Automation fails for windows that do not exist).
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)?;
        if let Ok(options) = automation.cast::<IUIAutomation2>() {
            let _ = options.SetConnectionTimeout(TIMEOUT_MS);
            let _ = options.SetTransactionTimeout(TIMEOUT_MS);
        }
        let root = automation.ElementFromHandle(window)?;
        let of_type = |id: i32| {
            automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(id))
        };
        let lists = root.FindAll(TreeScope_Descendants, &of_type(UIA_ListControlTypeId.0)?)?;
        if lists.Length()? == 0 {
            return Ok(None);
        }
        let is_item = of_type(UIA_ListItemControlTypeId.0)?;
        let mut rows = Vec::new();
        for list in 0..lists.Length()? {
            let items = lists
                .GetElement(list)?
                .FindAll(TreeScope_Children, &is_item)?;
            for index in 0..items.Length()? {
                let item = items.GetElement(index)?;
                let id = item
                    .CurrentAutomationId()
                    .map(|id| id.to_string())
                    .unwrap_or_default();
                if !id.starts_with(prefix) {
                    continue;
                }
                let offscreen = item.CurrentIsOffscreen().is_ok_and(|off| off.as_bool());
                let center = (!offscreen)
                    .then(|| item.CurrentBoundingRectangle().ok())
                    .flatten()
                    .filter(|rect| rect.right > rect.left && rect.bottom > rect.top)
                    .map(|rect| POINT {
                        x: (rect.left + rect.right) / 2,
                        y: (rect.top + rect.bottom) / 2,
                    });
                let name = item
                    .CurrentName()
                    .map(|name| name.to_string())
                    .unwrap_or_default();
                rows.push(ListRow { id, name, center });
            }
        }
        Ok(Some(rows))
    }
}

/// A left click at `at` when that point shows `window` (never on whatever covers it), then the
/// cursor goes back where the user left it. Qt list rows need this: UI Automation's
/// SelectionItem only marks a row selected, the app acts on a click.
pub(crate) fn click_in(window: HWND, at: POINT) -> bool {
    // SAFETY: WindowFromPoint and GetAncestor take values and return null for nothing found.
    if unsafe { GetAncestor(WindowFromPoint(at), GA_ROOT) } != window {
        return false;
    }
    let back = window::cursor_position();
    // SAFETY: SetCursorPos takes plain coordinates.
    if unsafe { SetCursorPos(at.x, at.y) }.is_err() {
        return false;
    }
    let input = |flags| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: flags,
                ..Default::default()
            },
        },
    };
    // SAFETY: the slice holds two fully initialized mouse INPUTs and the size is INPUT's own.
    let sent = unsafe {
        SendInput(
            &[input(MOUSEEVENTF_LEFTDOWN), input(MOUSEEVENTF_LEFTUP)],
            size_of::<INPUT>() as i32,
        )
    };
    std::thread::sleep(std::time::Duration::from_millis(50));
    if let Some(back) = back {
        // SAFETY: SetCursorPos takes plain coordinates.
        let _ = unsafe { SetCursorPos(back.x, back.y) };
    }
    sent == 2
}
