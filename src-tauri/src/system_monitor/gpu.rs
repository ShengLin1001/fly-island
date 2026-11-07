//! An NVIDIA GPU through `nvidia-smi`, which comes with the driver. It runs on its own thread at
//! most every two seconds and the page shows the last reading; without the tool (no NVIDIA card)
//! the page shows no GPU.

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::system::CREATE_NO_WINDOW;

const REFRESH: Duration = Duration::from_secs(2);
const QUERY: &str = "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GpuStats {
    name: String,
    /// 0-100.
    usage: Option<f32>,
    /// Degrees Celsius.
    temperature: Option<f32>,
    /// MiB.
    memory_used: Option<f32>,
    memory_total: Option<f32>,
    /// Watts; laptop GPUs often do not say.
    power: Option<f32>,
}

#[derive(Default)]
struct State {
    last: Option<GpuStats>,
    read_at: Option<Instant>,
    reading: bool,
    /// nvidia-smi could not be started; not tried again this run.
    missing: bool,
}

static STATE: Mutex<State> = Mutex::new(State { last: None, read_at: None, reading: false, missing: false });

fn lock() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The last reading, starting a new one when it is older than two seconds.
pub(super) fn latest() -> Option<GpuStats> {
    let mut state = lock();
    let due = state.read_at.is_none_or(|at| at.elapsed() >= REFRESH);
    if due && !state.reading && !state.missing {
        state.reading = true;
        std::thread::spawn(read);
    }
    state.last.clone()
}

fn read() {
    let output = Command::new("nvidia-smi").args([QUERY, "--format=csv,noheader,nounits"]).creation_flags(CREATE_NO_WINDOW).output();
    let mut state = lock();
    state.reading = false;
    state.read_at = Some(Instant::now());
    match output {
        Ok(output) if output.status.success() => state.last = parse(&String::from_utf8_lossy(&output.stdout)),
        Ok(_) => state.last = None,
        Err(_) => state.missing = true,
    }
}

/// The first GPU from nvidia-smi's CSV line: "NVIDIA GeForce GTX 1050 Ti, 3, 56, 120, 4096, [N/A]".
fn parse(text: &str) -> Option<GpuStats> {
    let fields: Vec<&str> = text.lines().next()?.split(',').map(str::trim).collect();
    let [name, usage, temperature, memory_used, memory_total, power] = fields.as_slice() else {
        return None;
    };
    let number = |field: &str| field.parse::<f32>().ok();
    Some(GpuStats {
        name: name.to_string(),
        usage: number(usage),
        temperature: number(temperature),
        memory_used: number(memory_used),
        memory_total: number(memory_total),
        power: number(power),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reading_keeps_what_the_card_reports() {
        let gpu = parse("NVIDIA GeForce GTX 1050 Ti, 3, 56, 120, 4096, [N/A]\r\n").unwrap();
        assert_eq!(gpu.name, "NVIDIA GeForce GTX 1050 Ti");
        assert_eq!((gpu.usage, gpu.temperature, gpu.memory_total, gpu.power), (Some(3.0), Some(56.0), Some(4096.0), None));
        assert_eq!(parse("No devices were found"), None);
    }
}
