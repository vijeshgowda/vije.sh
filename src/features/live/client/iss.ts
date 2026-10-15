/**
 * LF-01 readings from wheretheiss.at, shared by every ISS card and the landing page preload, so
 * moving from the overview to /live shows the last position at once instead of after a round trip.
 * In memory only: a position is stale within seconds, so it is never persisted.
 */
import type { IssPosition } from "./globe";

export const ISS_API = "https://api.wheretheiss.at/v1/satellites/25544";
/** A cached position may seed a new globe while it waits for its first poll */
export const ISS_SEED_MS = 30_000;
/** The ground track spans 90 minutes and refreshes every 5 */
export const TRACK_MS = 5 * 60_000;

export interface IssReading extends IssPosition {
  altitude: number;
  velocity: number;
}
interface Cached<T> {
  d: T;
  at: number;
}

let pos: Cached<IssReading> | null = null;
const listeners = new Set<() => void>();
let track: Cached<IssPosition[]> | null = null;
let posReq: Promise<IssReading> | null = null;
let trackReq: Promise<IssPosition[]> | null = null;

async function getJSON<T>(url: string, ms: number): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Fetches the current position; concurrent callers share one request. */
export function fetchIss(ms = 6000): Promise<IssReading> {
  return (posReq ??= getJSON<IssReading>(ISS_API, ms)
    .then((d) => {
      pos = { d, at: Date.now() };
      listeners.forEach((l) => l());
      return d;
    })
    .finally(() => {
      posReq = null;
    }));
}

/** Fetches the next 90 minutes of ground track (10 points, 10 minutes apart). */
export function fetchTrack(ms = 8000): Promise<IssPosition[]> {
  return (trackReq ??= (() => {
    const t = Math.floor(Date.now() / 1000);
    const ts = Array.from({ length: 10 }, (_, k) => t + k * 600).join(",");
    return getJSON<IssPosition[]>(`${ISS_API}/positions?timestamps=${ts}`, ms);
  })()
    .then((d) => {
      track = { d, at: Date.now() };
      return d;
    })
    .finally(() => {
      trackReq = null;
    }));
}

/** The last reading, whatever its age, for useSyncExternalStore (server snapshot: null) */
export const issStore = {
  get: () => pos,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** The last reading if it is recent enough to call live */
export const cachedIss = (now = Date.now()) => (pos && now - pos.at < ISS_SEED_MS ? pos : null);

export const cachedTrack = (now = Date.now()) =>
  track && now - track.at < TRACK_MS ? track.d : null;

/** Fills both caches unless they are fresh; never throws (the preload is best effort). */
export async function warmIss(): Promise<void> {
  await Promise.all([
    cachedIss() ? null : fetchIss().catch(() => null),
    cachedTrack() ? null : fetchTrack().catch(() => null),
  ]);
}

/** Test helper: forget every cached reading */
export function resetIssCache() {
  pos = track = null;
  posReq = trackReq = null;
}
