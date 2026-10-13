import { describe, expect, it } from "vitest";
import { formatBytes, isoDate, isoMinute } from "./format";

describe("formatBytes()", () => {
  it("prints binary multiples like pg_size_pretty", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10_122_931)).toBe("9.7 MB");
    expect(formatBytes(10_480_000)).toBe("10 MB");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 MB");
    expect(formatBytes(3 * 1024 ** 5)).toBe("3072 TB");
  });
});

describe("dates", () => {
  const d = new Date("2026-10-12T21:51:30Z");
  it("formats in UTC", () => {
    expect(isoDate(d)).toBe("2026-10-12");
    expect(isoMinute(d)).toBe("2026-10-12 21:51 UTC");
  });
});
