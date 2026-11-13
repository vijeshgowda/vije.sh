import { describe, expect, it } from "vitest";
import { countdown, localRelease, midnightIn, zoneCountry } from "./countdown";

describe("midnightIn", () => {
  it("is midnight UK time in London (after BST ends)", () => {
    expect(midnightIn("Europe/London", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 19));
  });

  it("is midnight local time in zones ahead of and behind UTC", () => {
    expect(midnightIn("Asia/Kolkata", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 18, 30));
    expect(midnightIn("America/New_York", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 19, 5));
    expect(midnightIn("Pacific/Kiritimati", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 10));
  });

  it("uses the offset in force at midnight, not at UTC midnight, across a DST change", () => {
    // New York leaves EDT at 02:00 on 1 Nov 2026; midnight that day is still EDT (UTC-4)
    expect(midnightIn("America/New_York", 2026, 10, 1)).toBe(Date.UTC(2026, 10, 1, 4));
    // Sydney enters AEDT on 4 Oct 2026; midnight on the 5th is UTC+11
    expect(midnightIn("Australia/Sydney", 2026, 9, 5)).toBe(Date.UTC(2026, 9, 4, 13));
  });
});

describe("zoneCountry", () => {
  it("maps canonical zones and the older IDs ICU-based browsers report", () => {
    expect(zoneCountry("Asia/Kolkata")).toBe("IN");
    expect(zoneCountry("Asia/Calcutta")).toBe("IN");
    expect(zoneCountry("Europe/London")).toBe("GB");
    expect(zoneCountry("Europe/Oslo")).toBe("NO");
  });

  it("credits old IDs to their own country, not the country of their tzdata link target", () => {
    expect(zoneCountry("Pacific/Truk")).toBe("FM");
    expect(zoneCountry("Pacific/Ponape")).toBe("FM");
    expect(zoneCountry("America/Coral_Harbour")).toBe("CA");
  });

  it("has no country for UTC, Etc zones or abbreviations", () => {
    expect(zoneCountry("UTC")).toBeNull();
    expect(zoneCountry("Etc/GMT+5")).toBeNull();
    expect(zoneCountry("EST")).toBeNull();
  });
});

describe("localRelease", () => {
  it("names the visitor's country and offset", () => {
    expect(localRelease("Asia/Kolkata")).toEqual({
      at: Date.UTC(2026, 10, 18, 18, 30),
      timeZone: "Asia/Kolkata",
      country: "India",
      offset: "GMT+5:30",
    });
    expect(localRelease("Europe/London")).toMatchObject({
      country: "United Kingdom",
      offset: "GMT",
    });
  });

  it("falls back to no country when the zone doesn't name one", () => {
    expect(localRelease("UTC")).toMatchObject({ at: Date.UTC(2026, 10, 19), country: null });
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
