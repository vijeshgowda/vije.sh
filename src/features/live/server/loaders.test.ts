import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_FEED_KEYS } from "../catalog";
import { fakeFetch } from "./fixtures";
import { LOADERS } from "./loaders";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(fakeFetch()));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("feed loaders", () => {
  it("has a loader for every server feed", () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...SERVER_FEED_KEYS].sort());
  });

  it("launch manifest drops launches more than an hour old", async () => {
    const l = await LOADERS.man();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      name: "Falcon 9 | Starlink",
      status: "Go",
      lat: 28.56,
      lon: -80.57,
      orbit: "LEO",
    });
  });

  it("HN keeps safe URLs only and skips bad ids", async () => {
    const s = await LOADERS.hn();
    expect(s.map((x) => x.id)).toEqual([1, 2]);
    expect(s[0]!.url).toBe("https://example.com/a");
    expect(s[1]!.url).toBeNull();
  });

  it("Show HN strips the prefix", async () => {
    expect((await LOADERS.show())[0]!.title).toBe("A thing");
  });

  it("crew, news, models, papers, downloads", async () => {
    expect((await LOADERS.crew()).people[0]!.days).toBe(100);
    expect((await LOADERS.sfn())[0]!.site).toBe("SFN");
    expect((await LOADERS.hf()).map((m) => m.id)).toEqual(["org/small-1b"]);
    expect((await LOADERS.pap()).map((p) => p.id)).toEqual(["2610.05678", "2610.01234"]);
    expect((await LOADERS.npm()).map((d) => d.pkg)).toEqual([
      "next",
      "react",
      "express",
      "typescript",
      "vite",
    ]);
  });

  it("space weather reads Kp and solar wind", async () => {
    const k = await LOADERS.kp();
    expect(k.kp).toEqual([
      ["2026-10-09T00:00:00", 2.33],
      ["2026-10-09T03:00:00", 5.67],
    ]);
    expect(k.windKmS).toBe(412);
  });

  it("space weather survives a missing solar wind feed but not missing Kp", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "solar-wind-speed.json": new Error() })));
    expect((await LOADERS.kp()).windKmS).toBeNull();
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "noaa-planetary-k-index.json": [] })));
    await expect(LOADERS.kp()).rejects.toThrow("no Kp");
  });

  it("releases use the GitHub token when set and tolerate single failures", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t0ken");
    const r = await LOADERS.rel();
    expect(r).toHaveLength(5);
    expect(r[0]!.tag).toBe("v1.2.3");
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t0ken");
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "releases/latest": new Error() })));
    await expect(LOADERS.rel()).rejects.toThrow("no releases");
  });

  it("lifecycle keeps supported cycles and marks LTS", async () => {
    const c = await LOADERS.eol();
    expect(c.map((x) => `${x.product} ${x.cycle}${x.lts ? " LTS" : ""}`)).toEqual([
      "Node.js 26",
      "Node.js 24 LTS",
      "Kubernetes 1.36",
    ]);
    expect(c[2]!.eol).toBeNull();
  });

  it("status pages report unknown when unreachable", async () => {
    const s = await LOADERS.stat();
    expect(s.every((x) => x.indicator === "minor")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "status.json": new Error() })));
    await expect(LOADERS.stat()).rejects.toThrow("no status");
    vi.stubGlobal(
      "fetch",
      vi.fn(fakeFetch({ "githubstatus.com": { status: { indicator: "weird" } } })),
    );
    const mixed = await LOADERS.stat();
    expect(mixed[0]!.indicator).toBe("unknown");
    expect(mixed[1]!.indicator).toBe("minor");
  });

  it("X-rays keep the long band only", async () => {
    expect((await LOADERS.xr()).points).toEqual([["t0", 1e-6]]);
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "xrays-6-hour.json": [] })));
    await expect(LOADERS.xr()).rejects.toThrow("no flux");
  });

  it("quakes, events and advisories", async () => {
    expect((await LOADERS.eq())[0]).toMatchObject({ mag: 6.1, lon: 10, lat: 20, depth: 30 });
    const e = await LOADERS.eo();
    expect(e[0]).toMatchObject({
      category: "Severe Storms",
      date: "2026-10-08",
      magnitude: "65 kts",
    });
    expect(e[1]).toMatchObject({ date: null, url: null, magnitude: "" });
    const a = await LOADERS.sec();
    expect(a[0]!.pkg).toBe("left-pad");
    expect(a[0]!.summary.length).toBe(89);
  });

  it("throws on HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch({ "spaceflightnewsapi.net": new Error() })));
    await expect(LOADERS.sfn()).rejects.toThrow("HTTP 503");
  });
});
