import { useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/error";
import { getSystemStats, type SystemStats } from "./api";
import { pushSample } from "./format";

/** One sample a second while the page is open. */
const POLL_MS = 1_000;

export type SystemHistory = { cpu: number[]; gpu: number[]; download: number[]; upload: number[] };

const EMPTY_HISTORY: SystemHistory = { cpu: [], gpu: [], download: [], upload: [] };

/** The latest sample and the last minute of the charted figures, read while mounted. */
export function useSystemStats() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [history, setHistory] = useState<SystemHistory>(EMPTY_HISTORY);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const read = () => {
      getSystemStats()
        .then((next) => {
          if (cancelled) return;
          setStats(next);
          setError("");
          setHistory((last) => ({
            cpu: pushSample(last.cpu, next.cpu),
            gpu: pushSample(last.gpu, next.gpu?.usage ?? 0),
            download: pushSample(last.download, next.download),
            upload: pushSample(last.upload, next.upload),
          }));
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(getErrorMessage(reason));
        })
        // The next read waits for this one, so a slow sample never piles up calls.
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(read, POLL_MS);
        });
    };
    read();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return { stats, history, error };
}
