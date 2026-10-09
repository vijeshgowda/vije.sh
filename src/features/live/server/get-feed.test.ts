import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const { cacheLife } = await import("next/cache");
const { LOADERS } = await import("./loaders");
const { getFeed, getFeeds } = await import("./get-feed");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(cacheLife).mockClear();
});

describe("getFeed()", () => {
  it("returns data and caches for the feed's TTL", async () => {
    vi.spyOn(LOADERS, "npm").mockResolvedValue([{ pkg: "next", downloads: 1 }]);
    const r = await getFeed("npm");
    expect(r).toMatchObject({ ok: true, key: "npm", data: [{ pkg: "next", downloads: 1 }] });
    expect(cacheLife).toHaveBeenCalledWith({ stale: 60, revalidate: 86_400, expire: 345_600 });
  });

  it("turns upstream failures into a short-lived error result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(LOADERS, "hn").mockRejectedValue(new Error("boom"));
    expect(await getFeed("hn")).toMatchObject({ ok: false, key: "hn", error: "upstream" });
    expect(cacheLife).toHaveBeenCalledWith({ stale: 30, revalidate: 120, expire: 300 });
  });

  it("serves an offline result without calling upstream", async () => {
    vi.stubEnv("FEEDS_OFFLINE", "1");
    const spy = vi.spyOn(LOADERS, "man");
    expect(await getFeed("man")).toMatchObject({ ok: false, error: "offline" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("getFeeds() returns a record keyed by feed", async () => {
    vi.stubEnv("FEEDS_OFFLINE", "1");
    expect(Object.keys(await getFeeds(["man", "hn"]))).toEqual(["man", "hn"]);
  });
});
