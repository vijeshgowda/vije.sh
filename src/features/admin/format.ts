/** Display helpers for /admin; deterministic (UTC, no locale), so server and client agree. */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 10122931 -> "9.7 MB" (binary multiples, as pg_size_pretty prints them). */
export function formatBytes(bytes: number): string {
  let n = Math.max(0, bytes);
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n < 9.95 ? 1 : 0)} ${UNITS[i]}`;
}

/** "2026-10-12" (UTC). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** "2026-10-12 21:51 UTC". */
export const isoMinute = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
