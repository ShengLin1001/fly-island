import { useState } from "react";
import { ArrowDown, ArrowUp, BatteryCharging, BatteryMedium } from "lucide-react";
import { useTranslation } from "../../i18n";
import { formatBytes } from "../../utils/bytes";
import type { ProcessUsage } from "./api";
import { HISTORY_LENGTH, formatPercent, formatRate, formatUsedOfTotal, sparklinePoints } from "./format";
import { useSystemStats } from "./useSystemStats";
import "./SystemMonitorPanel.css";

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 28;

function Sparkline({ values, max, tone }: { values: number[]; max: number; tone: string }) {
  const points = sparklinePoints(values, HISTORY_LENGTH, SPARK_WIDTH, SPARK_HEIGHT, max);
  return (
    <svg className={`system-spark system-spark--${tone}`} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {points && <polygon className="system-spark__fill" points={`${points} ${SPARK_WIDTH},${SPARK_HEIGHT} ${points.slice(0, points.indexOf(","))},${SPARK_HEIGHT}`} />}
      {points && <polyline className="system-spark__line" points={points} />}
    </svg>
  );
}

/** A level 0-100 as a thin bar; turns orange past 70 and red past 90. */
function Meter({ value, tone }: { value: number; tone: string }) {
  const level = value >= 90 ? "high" : value >= 70 ? "medium" : "low";
  return (
    <span className={`system-meter system-meter--${tone} system-meter--${level}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}

/**
 * The system monitor page (built-in plugin focusd.system-monitor): CPU and GPU cards with a
 * minute of history, memory, network speed and the battery, and the busiest programs.
 */
export function SystemMonitorPanel() {
  const t = useTranslation().systemMonitor;
  const { stats, history, error } = useSystemStats();
  const [sortBy, setSortBy] = useState<"cpu" | "memory">("cpu");

  if (!stats) {
    return <section className="system-monitor system-monitor--empty" aria-label={t.title}>{error ? t.failed(error) : t.reading}</section>;
  }
  const gpu = stats.gpu;
  const memoryShare = stats.memoryTotal > 0 ? (stats.memoryUsed / stats.memoryTotal) * 100 : 0;
  // Network charts share one scale so download and upload compare at a glance.
  const rateMax = Math.max(64 * 1024, ...history.download, ...history.upload);
  const processes: ProcessUsage[] = sortBy === "cpu" ? stats.byCpu : stats.byMemory;

  return (
    <section className="system-monitor" aria-label={t.title}>
      <div className="system-monitor__cards">
        <div className="system-card system-card--cpu">
          <div className="system-card__head">
            <span className="system-card__label">CPU</span>
            <strong className="system-card__value">{formatPercent(stats.cpu)}</strong>
          </div>
          <Sparkline values={history.cpu} max={100} tone="cpu" />
          <div className="system-cores" aria-hidden="true">
            {stats.cores.map((core, index) => (
              <span key={index} className="system-cores__core"><span style={{ height: `${Math.max(4, Math.min(100, core))}%` }} /></span>
            ))}
          </div>
        </div>
        <div className="system-card system-card--gpu">
          <div className="system-card__head">
            <span className="system-card__label">GPU</span>
            <strong className="system-card__value">{gpu?.usage != null ? formatPercent(gpu.usage) : "—"}</strong>
            {gpu?.temperature != null && <span className="system-card__extra">{Math.round(gpu.temperature)}°C</span>}
          </div>
          <Sparkline values={history.gpu} max={100} tone="gpu" />
          <div className="system-card__foot">
            <span className="system-card__name">{gpu?.name.replace(/^NVIDIA (GeForce )?/, "") ?? "—"}</span>
            {gpu?.memoryUsed != null && gpu.memoryTotal != null && (
              <span>{t.videoMemory} {formatUsedOfTotal(gpu.memoryUsed * 1024 ** 2, gpu.memoryTotal * 1024 ** 2)}</span>
            )}
            {gpu?.power != null && <span>{Math.round(gpu.power)} W</span>}
          </div>
        </div>
      </div>

      <div className="system-row">
        <span className="system-row__label">{t.memory}</span>
        <Meter value={memoryShare} tone="memory" />
        <span className="system-row__value">{formatUsedOfTotal(stats.memoryUsed, stats.memoryTotal)}</span>
      </div>

      <div className="system-net">
        <div className="system-net__item system-net__item--down">
          <ArrowDown size={13} aria-label={t.download} />
          <span className="system-net__rate">{formatRate(stats.download)}</span>
          <Sparkline values={history.download} max={rateMax} tone="down" />
        </div>
        <div className="system-net__item system-net__item--up">
          <ArrowUp size={13} aria-label={t.upload} />
          <span className="system-net__rate">{formatRate(stats.upload)}</span>
          <Sparkline values={history.upload} max={rateMax} tone="up" />
        </div>
        {stats.battery && (
          <div className="system-net__battery" aria-label={`${t.battery} ${stats.battery.percent}%${stats.battery.pluggedIn ? ` · ${t.charging}` : ""}`}>
            {stats.battery.pluggedIn ? <BatteryCharging size={15} aria-hidden="true" /> : <BatteryMedium size={15} aria-hidden="true" />}
            <span>{stats.battery.percent}%</span>
          </div>
        )}
      </div>

      <div className="system-processes">
        <div className="system-processes__head">
          <span>{t.processes}</span>
          <div className="system-processes__toggle" role="group" aria-label={t.processes}>
            {(["cpu", "memory"] as const).map((key) => (
              <button key={key} type="button" aria-pressed={sortBy === key} onClick={() => setSortBy(key)}>
                {key === "cpu" ? t.byCpu : t.byMemory}
              </button>
            ))}
          </div>
        </div>
        <ol className="system-processes__list">
          {processes.map((process) => (
            <li key={process.name}>
              <span className="system-processes__name">{process.name}</span>
              {process.count > 1 && <span className="system-processes__count" aria-label={t.processCount(process.count)}>×{process.count}</span>}
              <span className={`system-processes__cpu${sortBy === "cpu" ? " system-processes__sorted" : ""}`}>{process.cpu.toFixed(1)}%</span>
              <span className={`system-processes__memory${sortBy === "memory" ? " system-processes__sorted" : ""}`}>{formatBytes(process.memory)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
