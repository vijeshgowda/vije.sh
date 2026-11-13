import { ZONES_BY_COUNTRY } from "./timezone-countries";

/** Release day, 19 Nov 2026. It launches at midnight local time, so each visitor gets their own. */
export const GTA6_RELEASE_DAY = { year: 2026, month: 10, day: 19 } as const;

/** Milliseconds `timeZone` is ahead of UTC at instant `t`. */
function offsetAt(timeZone: string, t: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(t);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return wall - Math.floor(t / 1000) * 1000;
}

/** The instant it is 00:00 on `year-month-day` (month 0-based) in `timeZone`. */
export function midnightIn(timeZone: string, year: number, month: number, day: number): number {
  const wall = Date.UTC(year, month, day);
  const guess = wall - offsetAt(timeZone, wall);
  // a second pass corrects for an offset change between the guess and midnight
  return wall - offsetAt(timeZone, guess);
}

let countryByZone: Map<string, string> | undefined;

/** ISO country code for an IANA time zone, or null for zones without one (UTC, Etc/GMT+5). */
export function zoneCountry(timeZone: string): string | null {
  countryByZone ??= new Map(
    Object.entries(ZONES_BY_COUNTRY).flatMap(([cc, zones]) =>
      zones.split(" ").map((z) => [z, cc] as const),
    ),
  );
  return countryByZone.get(timeZone) ?? null;
}

export interface LocalRelease {
  /** Midnight on release day in the visitor's time zone. */
  at: number;
  timeZone: string;
  /** Country name in English, or null when the time zone doesn't name one. */
  country: string | null;
  /** Short offset label, e.g. "GMT+5:30". */
  offset: string;
}

/** GTA VI's release moment for a visitor in `timeZone` (the browser's, by default). */
export function localRelease(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): LocalRelease {
  const { year, month, day } = GTA6_RELEASE_DAY;
  const at = midnightIn(timeZone, year, month, day);
  const cc = zoneCountry(timeZone);
  const offset = (
    new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "local"
  ).replace(/^GMT[+-]0(?::00)?$/, "GMT");
  return {
    at,
    timeZone,
    country: cc ? (new Intl.DisplayNames("en", { type: "region" }).of(cc) ?? cc) : null,
    offset,
  };
}

export interface Countdown {
  done: boolean;
  d: number;
  h: number;
  m: number;
  s: number;
}

/** Whole days, hours, minutes and seconds left until `target`; all zero once it has passed. */
export function countdown(target: number, now: number): Countdown {
  const left = Math.max(0, Math.floor((target - now) / 1000));
  return {
    done: left === 0,
    d: Math.floor(left / 86400),
    h: Math.floor(left / 3600) % 24,
    m: Math.floor(left / 60) % 60,
    s: left % 60,
  };
}
