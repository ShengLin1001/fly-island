import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { getSystemStats, type SystemStats } from "./api";
import { formatPercent } from "./format";
import "./SystemGauge.css";

/** The bar reads a light sample (no processes) every two seconds while it shows. */
const POLL_MS = 2_000;
/** Px one item takes on the collapsed bar, its gap included (CollapsedSlots.sideWidth). */
const ITEM_WIDTH = 32;

/** Which figures the bar shows (the plugin's bar* settings). */
export type SystemGaugeItems = { cpu: boolean; memory: boolean; cpuTemperature: boolean; gpuTemperature: boolean };

export function systemGaugeWidth(items: SystemGaugeItems) {
  return Object.values(items).filter(Boolean).length * ITEM_WIDTH;
}

type Item = { key: string; label: string; value: string; level: "normal" | "warm" | "hot" };

/** "warm" from `warm` up, "hot" from `hot` up. */
function level(value: number | null | undefined, warm: number, hot: number): Item["level"] {
  if (value == null) return "normal";
  return value >= hot ? "hot" : value >= warm ? "warm" : "normal";
}

/**
 * The system monitor on the collapsed bar: small label-over-value columns for CPU and memory
 * load and the CPU and GPU temperatures, turning orange and red as they climb. A click opens the
 * monitor page. Reads only while `paused` is false.
 */
export function SystemGauge({ items, paused, onOpen }: { items: SystemGaugeItems; paused: boolean; onOpen: () => void }) {
  const t = useTranslation().systemMonitor;
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timer: number | undefined;
    const read = () => {
      getSystemStats(false)
        .then((next) => {
          if (!cancelled) setStats(next);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(read, POLL_MS);
        });
    };
    read();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [paused]);

  const memory = stats && stats.memoryTotal > 0 ? (stats.memoryUsed / stats.memoryTotal) * 100 : null;
  const degrees = (value: number | null | undefined) => (value == null ? "—" : `${Math.round(value)}°`);
  const shown: Item[] = [];
  if (items.cpu) shown.push({ key: "cpu", label: "CPU", value: stats ? formatPercent(stats.cpu) : "—", level: level(stats?.cpu, 70, 90) });
  if (items.memory) shown.push({ key: "memory", label: t.barMemory, value: memory == null ? "—" : formatPercent(memory), level: level(memory, 80, 92) });
  if (items.cpuTemperature) shown.push({ key: "cpuTemperature", label: "CPU", value: degrees(stats?.cpuTemperature), level: level(stats?.cpuTemperature, 75, 90) });
  if (items.gpuTemperature) shown.push({ key: "gpuTemperature", label: "GPU", value: degrees(stats?.gpu?.temperature), level: level(stats?.gpu?.temperature, 75, 87) });
  const label = shown.map((item) => `${item.key === "memory" ? t.memory : item.label} ${item.value}`).join(", ");

  return (
    <button
      className="system-gauge"
      type="button"
      aria-label={t.barLabel(label)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {shown.map((item) => (
        <span key={item.key} className={`system-gauge__item system-gauge__item--${item.key} system-gauge__item--${item.level}`}>
          <span className="system-gauge__label">{item.label}</span>
          <span className="system-gauge__value">{item.value}</span>
        </span>
      ))}
    </button>
  );
}
