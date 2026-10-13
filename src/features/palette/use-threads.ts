"use client";

import { useEffect, useState } from "react";
import { readThreads, type PaletteThread } from "./items";

/**
 * Forum threads for the palette, fetched each time it opens (a cached same-origin response). The
 * palette works without them: until they arrive, or if the request fails, there are none.
 */
export function usePaletteThreads(open: boolean): PaletteThread[] {
  const [threads, setThreads] = useState<PaletteThread[]>([]);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    fetch("/api/palette/threads", { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (body) setThreads(readThreads(body));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [open]);
  return threads;
}
