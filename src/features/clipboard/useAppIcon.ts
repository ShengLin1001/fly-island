import { useEffect, useState } from "react";
import { getAppIcon } from "./api";

// One request per program for the window's lifetime; the native side caches the PNG too.
const icons = new Map<string, Promise<string | null>>();

/** The icon of the program at `path` (C24.2), or null while loading or without one. */
export function useAppIcon(path: string | undefined) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setIcon(null);
      return;
    }
    let cancelled = false;
    let request = icons.get(path);
    if (!request) {
      request = getAppIcon(path).catch(() => null);
      icons.set(path, request);
    }
    void request.then((url) => {
      if (!cancelled) setIcon(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return icon;
}
