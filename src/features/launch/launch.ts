"use client";

import { useSyncExternalStore } from "react";

/** The "launch" easter egg: one flight at a time, started by the footer button, the palette or typing the word. */
let active = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function launch() {
  if (active) return;
  active = true;
  emit();
}

/** Called by the overlay when the flight is over. */
export function landed() {
  active = false;
  emit();
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

export function useLaunching(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );
}

export const WORD = "launch";

/** Appends a typed key to the rolling buffer; `hit` is true when the buffer ends with the word. */
export function typed(buffer: string, key: string): { buffer: string; hit: boolean } {
  const next = (buffer + key.toLowerCase()).slice(-WORD.length);
  return next === WORD ? { buffer: "", hit: true } : { buffer: next, hit: false };
}

/** Keys that count as typing: printable, no modifiers, not inside a form field. */
export function countsAsTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return false;
  const t = e.target instanceof Element ? e.target : null;
  return !t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}
