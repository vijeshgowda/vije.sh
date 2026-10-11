import { describe, expect, it } from "vitest";
import { FEEDS, LIVE_ORDER, liveSize } from "./catalog";

describe("live layout", () => {
  it("orders every feed exactly once", () => {
    expect([...LIVE_ORDER].sort()).toEqual(FEEDS.map((f) => f.key).sort());
  });

  it("widens the globe, narrows the manifest, and keeps other spans from the catalogue", () => {
    expect(liveSize("iss")).toBe("w2");
    expect(liveSize("man")).toBeNull();
    expect(liveSize("eq")).toBe("w3");
    expect(liveSize("hn")).toBe("w3");
    expect(liveSize("crew")).toBeNull();
  });
});
