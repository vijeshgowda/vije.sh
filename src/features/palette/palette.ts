"use client";

import { useSyncExternalStore } from "react";

/** Open state of the jump-to palette, shared by its triggers (header, footer, Ctrl K) and the dialog. */
let open = false;
const subs = new Set<() => void>();

export function setPaletteOpen(next: boolean) {
  if (next === open) return;
  open = next;
  subs.forEach((f) => f());
}

export const openPalette = () => setPaletteOpen(true);

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (and in prerendered HTML). */
export function useShortcutLabel(): string {
  return useSyncExternalStore(noop, isApple, () => false) ? "\u2318K" : "Ctrl K";
}
