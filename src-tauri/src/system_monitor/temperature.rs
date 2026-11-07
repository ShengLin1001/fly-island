//! The CPU temperature as the hottest ACPI thermal zone (win32/thermal.rs), read on its own thread
//! at most every two seconds like the GPU; machines without a zone show none.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::win32::{com::ComApartment, thermal::ThermalZones};

const REFRESH: Duration = Duration::from_secs(2);

struct State {
    last: Option<f32>,
    read_at: Option<Instant>,
    reading: bool,
}

static STATE: Mutex<State> = Mutex::new(State { last: None, read_at: None, reading: false });

/// The last reading in degrees Celsius, starting a new one when it is older than two seconds.
pub(super) fn latest() -> Option<f32> {
    let mut state = STATE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.read_at.is_none_or(|at| at.elapsed() >= REFRESH) && !state.reading {
        state.reading = true;
        std::thread::spawn(read);
    }
    state.last
}

fn read() {
    // shortcut: connects to WMI on every read (tens of ms every two seconds); keep the connection
    // on a long-lived thread if that ever shows.
    let celsius = ComApartment::multithreaded().ok().and_then(|_com| ThermalZones::open().ok()?.hottest_celsius());
    let mut state = STATE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    state.reading = false;
    state.read_at = Some(Instant::now());
    state.last = celsius;
}
