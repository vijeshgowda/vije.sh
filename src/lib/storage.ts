import { SITE } from "@/config/site";

/** Client-side localStorage wrapper: every key gets the site prefix, values are JSON, failures are ignored. */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(SITE.storagePrefix + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(SITE.storagePrefix + key, JSON.stringify(value));
    } catch {
      // private mode or quota: the UI keeps working without persistence
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(SITE.storagePrefix + key);
    } catch {
      // ignore
    }
  },
};
