import { describe, expect, it } from "vitest";
import { GTA6_RELEASE, countdown } from "./countdown";

describe("GTA6_RELEASE", () => {
  it("is midnight UK time on 19 November 2026", () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).formatToParts(GTA6_RELEASE);
    const uk = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    expect(uk).toMatchObject({
      weekday: "Thursday",
      day: "19",
      month: "November",
      year: "2026",
      hour: "00",
      minute: "00",
      timeZoneName: "GMT",
    });
  });
});

describe("countdown", () => {
  const t = Date.UTC(2026, 10, 19);

  it("splits the time left into days, hours, minutes and seconds", () => {
    const now = t - ((35 * 24 + 9) * 3600 + 30 * 60 + 54) * 1000;
    expect(countdown(t, now)).toEqual({ done: false, d: 35, h: 9, m: 30, s: 54 });
  });

  it("rounds partial seconds down", () => {
    expect(countdown(t, t - 1500)).toEqual({ done: false, d: 0, h: 0, m: 0, s: 1 });
  });

  it("stops at zero on and after release", () => {
    const zero = { done: true, d: 0, h: 0, m: 0, s: 0 };
    expect(countdown(t, t - 999)).toEqual(zero);
    expect(countdown(t, t)).toEqual(zero);
    expect(countdown(t, t + 86_400_000)).toEqual(zero);
  });
});
