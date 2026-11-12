import { describe, expect, it } from "vitest";
import { PAGES, pageByPathname } from "./site";

describe("site pages", () => {
  it("has seven pages coded P1..P7 with unique routes", () => {
    expect(PAGES.map((p) => p.code)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(new Set(PAGES.map((p) => p.href)).size).toBe(PAGES.length);
  });

  it("finds the most specific page for a path", () => {
    expect(pageByPathname("/")?.label).toBe("Overview");
    expect(pageByPathname("/live")?.label).toBe("Live");
    expect(pageByPathname("/blog/post")?.label).toBe("Blog");
    expect(pageByPathname("/lab")?.label).toBe("Lab");
    expect(pageByPathname("/lab/omni")?.label).toBe("Omni");
    expect(pageByPathname("/lab/omni/room")?.label).toBe("Omni");
    expect(pageByPathname("/lab/omnibus")?.label).toBe("Lab");
    expect(pageByPathname("/admin")).toBeUndefined();
    expect(pageByPathname("/livestream")).toBeUndefined();
  });
});
