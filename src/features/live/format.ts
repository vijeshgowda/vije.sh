/** Pure helpers shared by feed parsers (server) and feed bodies (client). */

export const p2 = (n: number) => String(n).padStart(2, "0");

/** Keeps only http(s) URLs, so feed data can't inject javascript: or data: links. */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
  } catch {
    return null;
  }
}

export const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");

export function ago(t: number, now: number): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/** Launch countdown: T-1d 02:03:04 before, T+ after */
export function tminus(net: string, now: number): string {
  const ms = Date.parse(net) - now;
  const a = Math.abs(ms) / 1000;
  const d = Math.floor(a / 86400);
  const hms = `${p2(Math.floor(a / 3600) % 24)}:${p2(Math.floor(a / 60) % 60)}:${p2(Math.floor(a % 60))}`;
  return `${ms >= 0 ? "T-" : "T+"}${d ? `${d}d ` : ""}${hms}`;
}

export function fmtN(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

/** GOES flare class from 0.1-0.8 nm flux in W/m² */
export function xclass(f: number): string {
  for (const [n, b] of [
    ["X", 1e-4],
    ["M", 1e-5],
    ["C", 1e-6],
    ["B", 1e-7],
    ["A", 1e-8],
  ] as const) {
    if (f >= b) return n + (f / b).toFixed(1);
  }
  return "A0.0";
}

export const latLon = (v: number, pos: string, neg: string) =>
  `${Math.abs(v).toFixed(2)}\u00b0${v >= 0 ? pos : neg}`;

/** Hugging Face model ids are "org/name": encode each segment, keep the slash */
export const hfPath = (id: string) => id.split("/").map(encodeURIComponent).join("/");

export const SYNODIC = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** Mean-synodic-month moon phase, good to about half a day */
export function moonAt(t: number) {
  const age = ((((t - NEW_MOON_2000) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC;
  const e = (age / SYNODIC) * 2 * Math.PI;
  return { age, e, illum: (1 - Math.cos(e)) / 2 };
}

export function phaseName(age: number): string {
  const names = [
    "New moon",
    "Waxing crescent",
    "First quarter",
    "Waxing gibbous",
    "Full moon",
    "Waning gibbous",
    "Last quarter",
    "Waning crescent",
  ];
  return names[Math.floor((age / SYNODIC) * 8 + 0.5) % 8]!;
}

/** SVG path of the lit part of a moon of radius r, as seen from the northern hemisphere */
export function moonPath(e: number, r = 40): string {
  const rx = (Math.abs(Math.cos(e)) * r).toFixed(2);
  if (e < Math.PI)
    return `M0 -${r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${e < Math.PI / 2 ? 0 : 1} 0 -${r}Z`;
  return `M0 -${r}A${r} ${r} 0 0 0 0 ${r}A${rx} ${r} 0 0 ${e > Math.PI * 1.5 ? 1 : 0} 0 -${r}Z`;
}

/** WMO weather code to words (Open-Meteo) */
export function wmo(c: number): string {
  if (c === 0) return "Clear";
  if (c <= 2) return "Partly cloudy";
  if (c === 3) return "Overcast";
  if (c <= 48) return "Fog";
  if (c <= 57) return "Drizzle";
  if (c <= 67) return "Rain";
  if (c <= 77) return "Snow";
  if (c <= 82) return "Showers";
  if (c <= 86) return "Snow showers";
  return "Thunderstorm";
}

/** Kp label: quiet, active (>= 4) or G1..G5 storm (>= 5) */
export function kpLabel(kp: number): string {
  if (kp >= 5) return `G${Math.min(5, Math.floor(kp) - 4)} storm`;
  return kp >= 4 ? "active" : "quiet";
}

export const fmtDay = (iso: string | number, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString("en-GB", opts);
