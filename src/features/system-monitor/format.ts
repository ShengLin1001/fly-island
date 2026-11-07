import { formatBytes } from "../../utils/bytes.ts";

/** A minute of samples for the sparklines. */
export const HISTORY_LENGTH = 60;

/** `values` with `value` added at the end, keeping the newest `HISTORY_LENGTH`. */
export function pushSample(values: number[], value: number) {
  return [...values, value].slice(-HISTORY_LENGTH);
}

/** A speed: "1.2 MB/s". */
export function formatRate(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** Used of total memory, "12.4 / 16 GB": one decimal on the used part so a change shows. */
export function formatUsedOfTotal(used: number, total: number) {
  const gb = 1024 ** 3;
  return `${(used / gb).toFixed(1)} / ${Number((total / gb).toFixed(1))} GB`;
}

/** A whole percentage, "23%". */
export function formatPercent(value: number) {
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

/** SVG polyline points for `values` in a `width` × `height` box, the top meaning `max`. */
export function sparklinePoints(values: number[], length: number, width: number, height: number, max: number) {
  if (values.length === 0) return "";
  const step = width / Math.max(1, length - 1);
  // Right-aligned: the newest sample sits at the right edge while the minute fills up.
  const start = width - step * (values.length - 1);
  return values
    .map((value, index) => `${(start + index * step).toFixed(1)},${(height - (Math.min(value, max) / max) * height).toFixed(1)}`)
    .join(" ");
}
