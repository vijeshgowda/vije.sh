/**
 * LF-13 data: the visitor's location and Open-Meteo forecast, cached in localStorage (`vj:wx-loc`,
 * `vj:wx:<lat>,<lon>` for 15 minutes). Shared by the card and the overview preload, so /live can
 * show the weather without a round trip.
 */
import { storage } from "@/lib/storage";

export interface Loc {
  lat: number;
  lon: number;
  name: string;
}
export interface Weather {
  t: number;
  h: number;
  w: number;
  p: number;
  c: number;
  sunrise: string;
  sunset: string;
  hi: number;
  lo: number;
}

export const LOC_KEY = "wx-loc";
const TTL = 15 * 60_000;
const FALLBACK: Loc = { lat: 51.51, lon: -0.13, name: "London" };

async function getJSON(url: string, ms = 10_000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Location from the visitor's time zone city (no permission needed), or the browser on request. */
async function homeLoc(): Promise<Loc> {
  const saved = storage.get<Loc | null>(LOC_KEY, null);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  const city = (tz.split("/").pop() ?? "London").replace(/_/g, " ");
  try {
    const d = (await getJSON(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      8000,
    )) as { results?: { latitude: number; longitude: number; name: string }[] };
    const r = d.results?.[0];
    if (r) {
      const loc = { lat: +r.latitude, lon: +r.longitude, name: String(r.name || city) };
      storage.set(LOC_KEY, loc);
      return loc;
    }
  } catch {
    // fall back to the default
  }
  return FALLBACK;
}

async function forecast(l: Loc): Promise<{ d: Weather; at: number; cached: boolean }> {
  const key = `wx:${l.lat.toFixed(1)},${l.lon.toFixed(1)}`;
  const c = storage.get<{ d: Weather; at: number } | null>(key, null);
  if (c && Date.now() - c.at < TTL) return { ...c, cached: true };
  const u =
    `https://api.open-meteo.com/v1/forecast?latitude=${l.lat.toFixed(2)}&longitude=${l.lon.toFixed(2)}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,pressure_msl" +
    "&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1";
  try {
    const raw = (await getJSON(u)) as {
      current?: Record<string, number>;
      daily?: Record<string, (string | number)[]>;
    };
    const k = raw.current ?? {};
    const y = raw.daily ?? {};
    const d: Weather = {
      t: +(k.temperature_2m ?? NaN),
      h: +(k.relative_humidity_2m ?? NaN),
      w: +(k.wind_speed_10m ?? NaN),
      p: +(k.pressure_msl ?? NaN),
      c: +(k.weather_code ?? 0),
      sunrise: String(y.sunrise?.[0] ?? ""),
      sunset: String(y.sunset?.[0] ?? ""),
      hi: +(y.temperature_2m_max?.[0] ?? NaN),
      lo: +(y.temperature_2m_min?.[0] ?? NaN),
    };
    if (!Number.isFinite(d.t)) throw new Error("no temperature");
    const at = Date.now();
    storage.set(key, { d, at });
    return { d, at, cached: false };
  } catch (e) {
    if (c) return { ...c, cached: true };
    throw e;
  }
}

export type WeatherReading = { loc: Loc; d: Weather; at: number; cached: boolean };

let req: Promise<WeatherReading> | null = null;

/** Location then forecast; concurrent callers (the card and the preload) share one request. */
export function loadWeather(): Promise<WeatherReading> {
  return (req ??= (async () => {
    const loc = await homeLoc();
    return { loc, ...(await forecast(loc)) };
  })().finally(() => {
    req = null;
  }));
}

/** Fills the cache unless it is fresh; never throws (the preload is best effort). */
export async function warmWeather(): Promise<void> {
  await loadWeather().catch(() => null);
}
