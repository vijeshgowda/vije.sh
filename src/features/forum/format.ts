import type { Route } from "next";

/** Threads per list; v1 has no pagination. */
export const THREADS_PER_LIST = 50;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_BIGINT = 9223372036854775807n;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A positive bigint id as written in a URL ("42"), or null. No signs, leading zeros or spaces. */
export function parseThreadId(raw: string): string | null {
  if (!/^[1-9]\d{0,18}$/.test(raw)) return null;
  return BigInt(raw) <= MAX_BIGINT ? raw : null;
}

/** Same rule as the `app.categories.slug` check constraint */
export const isCategorySlug = (raw: string) => SLUG.test(raw);

export const forumHref = () => "/forum" as Route;
export const categoryHref = (slug: string) => `/forum/${encodeURIComponent(slug)}` as Route;
export const threadHref = (slug: string, id: string) => `${categoryHref(slug)}/${id}` as Route;

/** Thread id as a bus address: 42 -> "0x2A" */
export function threadAddress(id: string): string {
  return `0x${BigInt(id).toString(16).toUpperCase().padStart(2, "0")}`;
}

/** 0 -> "FRAME 00" */
export const frameLabel = (no: number) => `FRAME ${String(no).padStart(2, "0")}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** "12 Oct 2026", in UTC so prerendered HTML doesn't depend on the server's time zone. */
export function fmtDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Oct 2026, 14:05 UTC" */
export function fmtDateTime(d: Date): string {
  return `${fmtDay(d)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Shown wherever an account no longer exists */
export const DELETED_AUTHOR = "[deleted]";
