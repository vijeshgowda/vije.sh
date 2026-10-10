"use client";

import { useSyncExternalStore } from "react";

/** One short status message at a time, shown by <Toaster /> in the site layout. */
export type ToastState = { text: string; on: boolean };

const SHOW_MS = 2800;
const FADE_MS = 300;
const empty: ToastState = { text: "", on: false };
let state = empty;
let hideT: ReturnType<typeof setTimeout> | undefined;
let clearT: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

function set(next: ToastState) {
  state = next;
  subs.forEach((f) => f());
}

export function toast(text: string) {
  clearTimeout(hideT);
  clearTimeout(clearT);
  set({ text, on: true });
  hideT = setTimeout(() => {
    set({ ...state, on: false });
    // empty the live region once it has faded, so a stale message isn't read later
    clearT = setTimeout(() => set(empty), FADE_MS);
  }, SHOW_MS);
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

export function useToast(): ToastState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => empty,
  );
}
