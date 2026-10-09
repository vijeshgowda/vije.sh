import { describe, expect, it } from "vitest";
import { PAGES, pageBySegment } from "./site";

describe("site pages", () => {
  it("has seven pages coded P1..P7 with unique routes", () => {
    expect(PAGES.map((p) => p.code)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(new Set(PAGES.map((p) => p.href)).size).toBe(PAGES.length);
  });

  it("finds a page by its first path segment", () => {
    expect(pageBySegment("")?.label).toBe("Overview");
    expect(pageBySegment(null)?.label).toBe("Overview");
    expect(pageBySegment("live")?.label).toBe("Live");
    expect(pageBySegment("admin")).toBeUndefined();
  });
});
