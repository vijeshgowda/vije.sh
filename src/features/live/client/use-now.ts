"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared clock. Returns null during prerender and hydration (so server and client HTML match and
 * no component reads the time while prerendering), then the current time, ticking every `everyMs`.
 */
interface Clock {
  now: number;
  subs: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
  subscribe: (cb: () => void) => () => void;
  read: () => number;
}

const clocks = new Map<number, Clock>();

function clock(everyMs: number): Clock {
  const existing = clocks.get(everyMs);
  if (existing) return existing;
  const c: Clock = {
    now: Date.now(),
    subs: new Set(),
    // stable identities, so React doesn't resubscribe on every render
    subscribe(cb) {
      c.subs.add(cb);
      c.timer ??= setInterval(() => {
        c.now = Date.now();
        c.subs.forEach((f) => f());
      }, everyMs);
      return () => {
        c.subs.delete(cb);
        if (!c.subs.size) {
          clearInterval(c.timer);
          c.timer = undefined;
        }
      };
    },
    read: () => c.now,
  };
  clocks.set(everyMs, c);
  return c;
}

const serverNow = () => null;

export function useNow(everyMs = 1000): number | null {
  const c = clock(everyMs);
  return useSyncExternalStore(c.subscribe, c.read, serverNow);
}
