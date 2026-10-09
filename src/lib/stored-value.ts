"use client";

import { useSyncExternalStore } from "react";
import { SITE } from "@/config/site";
import { storage } from "@/lib/storage";

/**
 * A localStorage-backed value as an external store: same-tab updates notify via a custom event,
 * other tabs via "storage". The server snapshot is the fallback, so prerendered HTML is stable.
 */
const EVENT = "vj:store";

export function createStoredValue<T>(
  key: string,
  fallback: T,
  validate: (v: unknown) => T = (v) => v as T,
) {
  let cachedRaw: string | null | undefined;
  let cachedValue: T = fallback;

  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SITE.storagePrefix + key);
    } catch {
      raw = null;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedValue = raw === null ? fallback : validate(storage.get<unknown>(key, fallback));
    }
    return cachedValue;
  };

  const subscribe = (cb: () => void) => {
    const onEvent = (e: Event) => {
      if (e instanceof CustomEvent ? e.detail === key : true) cb();
    };
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("storage", onEvent);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("storage", onEvent);
    };
  };

  return {
    use: () => useSyncExternalStore(subscribe, read, () => fallback),
    get: read,
    set(value: T) {
      storage.set(key, value);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
  };
}
