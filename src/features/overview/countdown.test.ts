import { describe, expect, it } from "vitest";
import {
  countdown,
  localRelease,
  midnightIn,
  parseOffset,
  zoneCountry,
  zoneCountryName,
} from "./countdown";

describe("midnightIn", () => {
  it("is midnight UK time in London (after BST ends)", () => {
    expect(midnightIn("Europe/London", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 19));
  });

  it("is midnight local time in zones ahead of and behind UTC", () => {
    expect(midnightIn("Asia/Kolkata", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 18, 30));
    expect(midnightIn("America/New_York", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 19, 5));
    expect(midnightIn("Pacific/Kiritimati", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 10));
  });

  it("handles half- and quarter-hour offsets, in and out of DST", () => {
    expect(midnightIn("Asia/Kathmandu", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 18, 15));
    expect(midnightIn("America/St_Johns", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 19, 3, 30));
    // Lord Howe's DST is half an hour (+10:30 -> +11); Chatham is +13:45 in summer
    expect(midnightIn("Australia/Lord_Howe", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 13));
    expect(midnightIn("Pacific/Chatham", 2026, 10, 19)).toBe(Date.UTC(2026, 10, 18, 10, 15));
  });

  it("uses the offset in force at midnight, not at UTC midnight, across a DST change", () => {
    // New York leaves EDT at 02:00 on 1 Nov 2026; midnight that day is still EDT (UTC-4)
    expect(midnightIn("America/New_York", 2026, 10, 1)).toBe(Date.UTC(2026, 10, 1, 4));
    // Sydney enters AEDT on 4 Oct 2026; midnight on the 5th is UTC+11
    expect(midnightIn("Australia/Sydney", 2026, 9, 5)).toBe(Date.UTC(2026, 9, 4, 13));
  });
});

describe("parseOffset", () => {
  it("reads longOffset labels, including the bare GMT some engines use for zero", () => {
    expect(parseOffset("GMT+05:30")).toBe(330 * 60_000);
    expect(parseOffset("GMT-03:00")).toBe(-180 * 60_000);
    expect(parseOffset("GMT+00:00")).toBe(0);
    expect(parseOffset("GMT")).toBe(0);
  });
});

describe("zoneCountry", () => {
  it("maps canonical zones and the older IDs ICU-based browsers report", async () => {
    expect(await zoneCountry("Asia/Kolkata")).toBe("IN");
    expect(await zoneCountry("Asia/Calcutta")).toBe("IN");
    expect(await zoneCountry("Europe/London")).toBe("GB");
    expect(await zoneCountry("Europe/Oslo")).toBe("NO");
  });

  it("credits old IDs to their own country, not the country of their tzdata link target", async () => {
    expect(await zoneCountry("Pacific/Truk")).toBe("FM");
    expect(await zoneCountry("Pacific/Ponape")).toBe("FM");
    expect(await zoneCountry("America/Coral_Harbour")).toBe("CA");
  });

  it("has no country for UTC, Etc zones or abbreviations", async () => {
    expect(await zoneCountry("UTC")).toBeNull();
    expect(await zoneCountry("Etc/GMT+5")).toBeNull();
    expect(await zoneCountry("EST")).toBeNull();
  });
});

describe("zoneCountryName", () => {
  it("names the country in English, or null when the zone doesn't name one", async () => {
    expect(await zoneCountryName("Asia/Kolkata")).toBe("India");
    expect(await zoneCountryName("Europe/London")).toBe("United Kingdom");
    expect(await zoneCountryName("UTC")).toBeNull();
  });
});

describe("localRelease", () => {
  it("gives midnight and the short offset label in force then", () => {
    expect(localRelease("Asia/Kolkata")).toEqual({
      at: Date.UTC(2026, 10, 18, 18, 30),
      timeZone: "Asia/Kolkata",
      offset: "GMT+5:30",
    });
    expect(localRelease("Europe/London").offset).toBe("GMT");
    expect(localRelease("UTC")).toMatchObject({ at: Date.UTC(2026, 10, 19), offset: "GMT" });
    expect(localRelease("America/New_York").offset).toBe("GMT-5");
    expect(localRelease("America/St_Johns").offset).toBe("GMT-3:30");
    expect(localRelease("Asia/Kathmandu").offset).toBe("GMT+5:45");
    expect(localRelease("Australia/Lord_Howe").offset).toBe("GMT+11");
    expect(localRelease("Pacific/Chatham").offset).toBe("GMT+13:45");
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
