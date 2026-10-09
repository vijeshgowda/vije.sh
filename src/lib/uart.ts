"use client";

import { useSyncExternalStore } from "react";

/**
 * The hero's UART console as a tiny app-wide log. Any feature can call uart("k8s: ...") to print a
 * line; the console on the overview shows the last 8. Lines are kept in memory only.
 */
type State = { lines: string[]; seq: number };
let state: State = { lines: [], seq: 0 };
const subs = new Set<() => void>();
const MAX = 30;

export function uart(line: string) {
  state = { lines: [...state.lines, line].slice(-MAX), seq: state.seq + 1 };
  subs.forEach((f) => f());
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};
const read = () => state;
const empty: State = { lines: [], seq: 0 };

export function useUart(): State {
  return useSyncExternalStore(subscribe, read, () => empty);
}

let booted = false;
/** Prints the boot log once per page load (not again on client-side navigation). */
export function bootUart(lines: string[], stepMs: number) {
  if (booted) return;
  booted = true;
  if (stepMs <= 0) return lines.forEach(uart);
  lines.forEach((l, i) => setTimeout(() => uart(l), 300 + i * stepMs));
}
