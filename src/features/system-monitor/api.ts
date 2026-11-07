import { invoke } from "@tauri-apps/api/core";

/** The built-in plugin that shows the system monitor page (src-tauri/src/plugin_host/builtin.rs). */
export const SYSTEM_MONITOR_PLUGIN_ID = "focusd.system-monitor";

/** Mirrors ProcessUsage in src-tauri/src/system_monitor/processes.rs: one program, its processes added up. */
export type ProcessUsage = { name: string; cpu: number; memory: number; count: number };

/** Mirrors GpuStats in src-tauri/src/system_monitor/gpu.rs (memory in MiB, power in watts). */
export type GpuStats = {
  name: string;
  usage: number | null;
  temperature: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  power: number | null;
};

/** Mirrors SystemStats in src-tauri/src/system_monitor/mod.rs. Percentages are 0-100, sizes in bytes. */
export type SystemStats = {
  cpu: number;
  cores: number[];
  /** Degrees Celsius: the hottest ACPI thermal zone, near the CPU on laptops; null without one. */
  cpuTemperature: number | null;
  memoryUsed: number;
  memoryTotal: number;
  /** Bytes per second. */
  download: number;
  upload: number;
  battery: { percent: number; pluggedIn: boolean } | null;
  gpu: GpuStats | null;
  byCpu: ProcessUsage[];
  byMemory: ProcessUsage[];
};

/** `processes: false` skips the busiest-program lists (the collapsed bar's gauge). */
export function getSystemStats(processes = true) {
  return invoke<SystemStats>("get_system_stats", { processes });
}
