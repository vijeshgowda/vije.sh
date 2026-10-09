import { describe, expect, it } from "vitest";
import {
  BITS,
  bitsLabel,
  cellFill,
  DEFAULT_LAB,
  formatGb,
  gigabytes,
  parseLab,
  sizing,
} from "./sizing";

describe("sizing", () => {
  it("is params × bits ÷ 8", () => {
    expect(gigabytes(27, 16)).toBe(54);
    expect(gigabytes(8, 4)).toBe(4);
    expect(gigabytes(27, 1.58)).toBeCloseTo(5.3325);
  });

  it("formats one decimal under 10 GB and whole numbers above", () => {
    expect(formatGb(5.3325)).toBe("5.3");
    expect(formatGb(9.96)).toBe("10.0");
    expect(formatGb(54)).toBe("54");
    expect(formatGb(13.5)).toBe("14");
  });

  it("compares against the 16-bit size", () => {
    expect(sizing(27, 16).note).toBe("This is the standard 16-bit size.");
    const r = sizing(27, 4);
    expect(r).toMatchObject({ gb: 13.5, full: 54, ratio: 4 });
    expect(r.note).toBe("Standard 16-bit would be 54 GB, about 4.0× larger.");
  });

  it("fills register cells up to the bit width", () => {
    expect(Array.from({ length: 4 }, (_, k) => cellFill(1.58, k))).toEqual([
      1,
      expect.closeTo(0.58),
      0,
      0,
    ]);
    expect(cellFill(16, 15)).toBe(1);
  });

  it("labels the ternary width", () => {
    expect(BITS.map(bitsLabel)).toEqual(["16", "8", "4", "2", "1.58 ternary", "1"]);
  });
});

describe("parseLab", () => {
  it("keeps valid stored state", () => {
    expect(parseLab({ p: 70, b: 4 })).toEqual({ p: 70, b: 4 });
  });

  it.each([null, "x", { p: 0, b: 4 }, { p: 121, b: 4 }, { p: 2.5, b: 4 }, { p: 7, b: 3 }, {}])(
    "falls back on %j",
    (v) => expect(parseLab(v)).toBe(DEFAULT_LAB),
  );
});
