import { describe, expect, it } from "vitest";
import { career } from "@/content/profile";
import { timingLayout, yearFraction } from "./timing";

describe("yearFraction", () => {
  it("maps a UTC instant to a fractional year", () => {
    expect(yearFraction(Date.UTC(2026, 0, 1))).toBe(2026);
    expect(yearFraction(Date.UTC(2026, 6, 2, 12))).toBeCloseTo(2026.5, 6);
    expect(yearFraction(Date.UTC(2028, 11, 31, 23, 59, 59))).toBeLessThan(2029);
  });
});

describe("timingLayout", () => {
  it("matches the prototype geometry at the prototype's 'now'", () => {
    const t = timingLayout(career, 2026.76);
    expect(t.years.map((y) => y.year)).toEqual([
      2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027,
    ]);
    expect(t.years[0]!.x).toBe(170);
    expect(t.years.at(-1)!.x).toBe(780);
    expect(t.height).toBe(34 + 5 * 44 + 8);
    expect(t.nowX).toBe(765.4);
    expect(t.signals.map((s) => s.label)).toEqual([
      "MERIDIAN SYSTEMS",
      "HARBOR LABS",
      "KITE ANALYTICS",
      "UNIVERSITY",
    ]);
    // current role: rises in 2023, falls at "now"
    expect(t.signals[0]).toEqual({
      label: "MERIDIAN SYSTEMS",
      labelY: 105,
      d: "M170 110 H533 L539 90 H762.4 L768.4 110 H780",
    });
    // one clock pulse per year: 4 segments each
    expect(t.clock.match(/ L/g)).toHaveLength(4 * 10);
  });

  it("extends the axis as time passes", () => {
    const t = timingLayout(career, 2030.2);
    expect(t.years.at(-1)!.year).toBe(2031);
    expect(t.nowX).toBeLessThan(780);
    expect(t.signals[0]!.d).toContain(`H${+(t.nowX - 3).toFixed(1)} `);
  });

  it("keeps finished roles closed", () => {
    const t = timingLayout([{ from: "2019", to: "2021", org: "x" }], 2020.5);
    expect(t.years.map((y) => y.year)).toEqual([2019, 2020, 2021]);
    expect(t.signals[0]!.d).toBe("M170 110 H167 L173 90 H777 L783 110 H780");
  });
});
