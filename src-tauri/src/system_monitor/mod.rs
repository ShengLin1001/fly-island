//! The system monitor page (built-in plugin `focusd.system-monitor`): CPU in total and per core,
//! memory, network speed, the battery, the busiest processes and an NVIDIA GPU. The island asks
//! for a sample about once a second while the page is open; nothing is read otherwise.
//!
//! CPU temperature and whole-machine power are left out: Windows gives them only to
//! administrators or through vendor drivers.

mod gpu;
mod processes;

use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use sysinfo::{Networks, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::win32::power::power_source;
pub(crate) use gpu::GpuStats;
pub(crate) use processes::ProcessUsage;

/// How many processes each top list holds.
const TOP_PROCESSES: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryStats {
    percent: u8,
    plugged_in: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// All cores together, 0-100.
    cpu: f32,
    /// Each logical core, 0-100.
    cores: Vec<f32>,
    memory_used: u64,
    memory_total: u64,
    /// Bytes per second over every interface since the last sample.
    download: u64,
    upload: u64,
    battery: Option<BatteryStats>,
    gpu: Option<GpuStats>,
    /// The busiest processes by CPU and by memory, programs of the same name added up.
    by_cpu: Vec<ProcessUsage>,
    by_memory: Vec<ProcessUsage>,
}

struct Sampler {
    system: System,
    networks: Networks,
    networks_read_at: Instant,
}

// shortcut: kept for the whole run once the page has been opened (a few MB), drop it when the
// page closes if that ever matters.
static SAMPLER: Mutex<Option<Sampler>> = Mutex::new(None);

fn sample() -> SystemStats {
    let mut guard = SAMPLER.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let sampler = guard.get_or_insert_with(|| Sampler {
        system: System::new(),
        networks: Networks::new_with_refreshed_list(),
        networks_read_at: Instant::now(),
    });
    let system = &mut sampler.system;
    system.refresh_cpu_usage();
    system.refresh_memory();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu().with_memory());
    sampler.networks.refresh(true);
    let seconds = sampler.networks_read_at.elapsed().as_secs_f64().max(0.001);
    sampler.networks_read_at = Instant::now();
    // shortcut: sums every interface, so traffic through a VPN or TUN adapter counts twice; pick
    // the default route's interface if that shows.
    let (received, sent) = sampler
        .networks
        .iter()
        .filter(|(name, _)| !name.to_ascii_lowercase().contains("loopback"))
        .fold((0, 0), |(down, up), (_, data)| (down + data.received(), up + data.transmitted()));

    let cores = system.cpus().len().max(1);
    let listed = system.processes().values().filter(|process| process.pid().as_u32() != 0).map(|process| {
        (process.name().to_string_lossy().into_owned(), process.cpu_usage() / cores as f32, process.memory())
    });
    let (by_cpu, by_memory) = processes::top(listed, TOP_PROCESSES);
    SystemStats {
        cpu: system.global_cpu_usage(),
        cores: system.cpus().iter().map(|cpu| cpu.cpu_usage()).collect(),
        memory_used: system.used_memory(),
        memory_total: system.total_memory(),
        download: (received as f64 / seconds) as u64,
        upload: (sent as f64 / seconds) as u64,
        battery: power_source().and_then(|power| power.battery.map(|percent| BatteryStats { percent, plugged_in: power.plugged_in })),
        gpu: gpu::latest(),
        by_cpu,
        by_memory,
    }
}

/// One sample for the system monitor page. CPU and network figures cover the time since the
/// previous call, so the first one after opening the page reads low.
#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    tauri::async_runtime::spawn_blocking(sample).await.map_err(|error| error.to_string())
}

/// This module's Tauri commands, chained into `lib.rs`'s `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::system_monitor::get_system_stats,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
