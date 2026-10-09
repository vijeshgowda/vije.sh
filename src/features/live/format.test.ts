import { describe, expect, it } from "vitest";
import {
  ago,
  fmtN,
  hfPath,
  hostOf,
  kpLabel,
  latLon,
  moonAt,
  moonPath,
  phaseName,
  safeUrl,
  SYNODIC,
  tminus,
  wmo,
  xclass,
} from "./format";

describe("safeUrl", () => {
  it("keeps http(s) and drops everything else", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe("time", () => {
  const now = Date.UTC(2026, 9, 9, 12);
  it("ago() rounds to minutes, hours and days", () => {
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(ago(now - 3 * 86400_000, now)).toBe("3 d ago");
  });
  it("tminus() counts down and up", () => {
    expect(tminus(new Date(now + 3_723_000).toISOString(), now)).toBe("T-01:02:03");
    expect(tminus(new Date(now + 86_400_000 + 1000).toISOString(), now)).toBe("T-1d 00:00:01");
    expect(tminus(new Date(now - 61_000).toISOString(), now)).toBe("T+00:01:01");
  });
});

describe("numbers", () => {
  it("fmtN() abbreviates", () => {
    expect(fmtN(999)).toBe("999");
    expect(fmtN(1500)).toBe("1.5k");
    expect(fmtN(2_500_000)).toBe("2.5M");
    expect(fmtN(3_100_000_000)).toBe("3.1B");
  });
  it("xclass() maps flux to flare class", () => {
    expect(xclass(2.3e-4)).toBe("X2.3");
    expect(xclass(1e-5)).toBe("M1.0");
    expect(xclass(4.5e-6)).toBe("C4.5");
    expect(xclass(2e-7)).toBe("B2.0");
    expect(xclass(5e-8)).toBe("A5.0");
    expect(xclass(1e-9)).toBe("A0.0");
  });
  it("kpLabel() names storms", () => {
    expect(kpLabel(2)).toBe("quiet");
    expect(kpLabel(4.3)).toBe("active");
    expect(kpLabel(5)).toBe("G1 storm");
    expect(kpLabel(9)).toBe("G5 storm");
  });
  it("latLon() formats hemispheres", () => {
    expect(latLon(12.345, "N", "S")).toBe("12.35°N");
    expect(latLon(-1, "E", "W")).toBe("1.00°W");
  });
  it("wmo() covers every code band", () => {
    expect([0, 2, 3, 45, 55, 63, 75, 81, 85, 95].map(wmo)).toEqual([
      "Clear",
      "Partly cloudy",
      "Overcast",
      "Fog",
      "Drizzle",
      "Rain",
      "Snow",
      "Showers",
      "Snow showers",
      "Thunderstorm",
    ]);
  });
});

describe("strings", () => {
  it("hfPath() encodes segments but keeps the slash", () => {
    expect(hfPath("org/my model")).toBe("org/my%20model");
  });
  it("hostOf() drops www", () => {
    expect(hostOf("https://www.example.com/x")).toBe("example.com");
  });
});

describe("moon", () => {
  it("is new at the reference new moon and full half a month later", () => {
    const ref = Date.UTC(2000, 0, 6, 18, 14);
    expect(moonAt(ref).illum).toBeCloseTo(0, 5);
    expect(moonAt(ref + (SYNODIC / 2) * 864e5).illum).toBeCloseTo(1, 5);
    expect(phaseName(0)).toBe("New moon");
    expect(phaseName(SYNODIC / 2)).toBe("Full moon");
    expect(phaseName(SYNODIC * 0.74)).toBe("Last quarter");
  });
  it("draws waxing and waning shapes", () => {
    expect(moonPath(0.5)).toMatch(/^M0 -40A40 40 0 0 1/);
    expect(moonPath(2)).toContain("0 0 1 0 -40Z");
    expect(moonPath(4)).toMatch(/^M0 -40A40 40 0 0 0/);
    expect(moonPath(5.5)).toContain("0 0 1 0 -40Z");
  });
});
