/** Release day, 19 Nov 2026. It launches at midnight local time, so each visitor gets their own. */
export const GTA6_RELEASE_DAY = { year: 2026, month: 10, day: 19 } as const;

const offsetFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });

/** Milliseconds ahead of UTC from a `longOffset` label: "GMT+05:30", "GMT-03:00", or "GMT" for 0. */
export function parseOffset(label: string): number {
  const m = /([+-])(\d\d):(\d\d)/.exec(label);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
}

const offsetAt = (f: Intl.DateTimeFormat, t: number) =>
  parseOffset(f.formatToParts(t).find((p) => p.type === "timeZoneName")?.value ?? "");

function midnight(f: Intl.DateTimeFormat, year: number, month: number, day: number): number {
  const wall = Date.UTC(year, month, day);
  // a second pass corrects for an offset change between the guess and midnight
  return wall - offsetAt(f, wall - offsetAt(f, wall));
}

/** The instant it is 00:00 on `year-month-day` (month 0-based) in `timeZone`. */
export function midnightIn(timeZone: string, year: number, month: number, day: number): number {
  return midnight(offsetFormat(timeZone), year, month, day);
}

/** "GMT", "GMT-5", "GMT+5:30": the same short label as Intl's `shortOffset`. */
function offsetLabel(ms: number): string {
  const min = Math.abs(ms) / 60_000;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return ms ? `GMT${ms < 0 ? "-" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}` : "GMT";
}

export interface LocalRelease {
  /** Midnight on release day in the visitor's time zone. */
  at: number;
  timeZone: string;
  /** Short offset label, e.g. "GMT+5:30". */
  offset: string;
}

/** GTA VI's release moment for a visitor in `timeZone` (the browser's, by default). */
export function localRelease(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): LocalRelease {
  const { year, month, day } = GTA6_RELEASE_DAY;
  const f = offsetFormat(timeZone);
  const at = midnight(f, year, month, day);
  return { at, timeZone, offset: offsetLabel(offsetAt(f, at)) };
}

/**
 * ISO country code for an IANA time zone, or null for zones without one (UTC, Etc/GMT+5). The
 * table is loaded on demand, so it stays out of the page's initial JavaScript.
 */
export async function zoneCountry(timeZone: string): Promise<string | null> {
  const { ZONES_BY_COUNTRY } = await import("./timezone-countries");
  const hit = Object.entries(ZONES_BY_COUNTRY).find(([, zones]) =>
    zones.split(" ").includes(timeZone),
  );
  return hit?.[0] ?? null;
}

/** English name of the country `timeZone` is in, or null when the zone doesn't name one. */
export async function zoneCountryName(timeZone: string): Promise<string | null> {
  const cc = await zoneCountry(timeZone);
  return cc ? (new Intl.DisplayNames("en", { type: "region" }).of(cc) ?? cc) : null;
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
