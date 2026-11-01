import { describe, expect, it } from "vitest";
import { cleanCode, codeFromHash, isValidCode } from "./code";
import { formatClock } from "./format";

describe("room codes", () => {
  it("normalises like the original client", () => {
    expect(cleanCode(" k7q-2m9 ")).toBe("K7Q2M9");
    expect(isValidCode("ABC")).toBe(false);
    expect(isValidCode("ABCD")).toBe(true);
    expect(isValidCode("ABCDEFGHIJK")).toBe(false);
  });

  it("reads share links", () => {
    expect(codeFromHash("#k7q2m9")).toBe("K7Q2M9");
    expect(codeFromHash("#%20ab%2Dcd")).toBe("ABCD");
    expect(codeFromHash("#ab")).toBe("");
    expect(codeFromHash("")).toBe("");
    expect(codeFromHash("#%E0%A4%A")).toBe("");
  });
});

describe("formatClock", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65.9)).toBe("01:05");
    expect(formatClock(3_725)).toBe("1:02:05");
    expect(formatClock(-4)).toBe("00:00");
  });
});
