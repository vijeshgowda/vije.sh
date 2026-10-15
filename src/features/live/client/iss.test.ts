import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedIss,
  cachedTrack,
  fetchIss,
  fetchTrack,
  ISS_SEED_MS,
  issStore,
  resetIssCache,
  TRACK_MS,
  warmIss,
} from "./iss";

const reading = { latitude: 51.5, longitude: -0.1, altitude: 420, velocity: 27_600 };
const track = [{ latitude: 1, longitude: 2 }];

function stubFetch(fail = false) {
  const fetch = vi.fn(async (url: string) => {
    if (fail) throw new Error("offline");
    return Response.json(url.includes("/positions") ? track : reading);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  resetIssCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ISS cache", () => {
  it("shares one request between concurrent callers and notifies subscribers", async () => {
    const fetch = stubFetch();
    const seen = vi.fn();
    const unsubscribe = issStore.subscribe(seen);
    const [a, b] = await Promise.all([fetchIss(), fetchIss()]);
    expect(a).toEqual(reading);
    expect(b).toBe(a);
    expect(fetch).toHaveBeenCalledOnce();
    expect(seen).toHaveBeenCalledOnce();
    expect(issStore.get()).toEqual({ d: reading, at: 1_000_000 });
    unsubscribe();
    await fetchIss();
    expect(seen).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("calls a position live for 30 s, but keeps it as the last reading", async () => {
    stubFetch();
    expect(cachedIss()).toBeNull();
    await fetchIss();
    expect(cachedIss(1_000_000 + ISS_SEED_MS - 1)?.d).toEqual(reading);
    expect(cachedIss(1_000_000 + ISS_SEED_MS)).toBeNull();
    expect(issStore.get()?.d).toEqual(reading);
  });

  it("asks for ten track points 10 minutes apart and keeps them for 5 minutes", async () => {
    const fetch = stubFetch();
    await fetchTrack();
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.pathname).toMatch(/\/positions$/);
    expect(url.searchParams.get("timestamps")!.split(",")).toHaveLength(10);
    expect(url.searchParams.get("timestamps")!.split(",").slice(0, 2)).toEqual(["1000", "1600"]);
    expect(cachedTrack(1_000_000 + TRACK_MS - 1)).toEqual(track);
    expect(cachedTrack(1_000_000 + TRACK_MS)).toBeNull();
  });

  it("rejects on HTTP errors and allows a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    await expect(fetchIss()).rejects.toThrow("HTTP 429");
    stubFetch();
    await expect(fetchIss()).resolves.toEqual(reading);
  });

  it("warmIss fills both caches once, skips fresh ones and never throws", async () => {
    const fetch = stubFetch();
    await warmIss();
    expect(fetch).toHaveBeenCalledTimes(2);
    await warmIss();
    expect(fetch).toHaveBeenCalledTimes(2);

    resetIssCache();
    stubFetch(true);
    await expect(warmIss()).resolves.toBeUndefined();
    expect(cachedIss()).toBeNull();
  });
});
