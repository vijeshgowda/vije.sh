import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PINS } from "../catalog";
import { ensureQuakes, globeBus } from "./globe-bus";
import { liveFilter, pins } from "./prefs";
import { useNow } from "./use-now";

afterEach(() => vi.useRealTimers());

describe("useNow", () => {
  it("ticks on a shared clock and stops when unused", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result, unmount } = renderHook(() => useNow(1000));
    const first = result.current;
    expect(first).not.toBeNull();
    act(() => {
      vi.setSystemTime(1_005_000);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBeGreaterThan(first!);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("prefs", () => {
  it("pins default to LF-01..03 and drop unknown keys", () => {
    const { result } = renderHook(() => pins.use());
    expect(result.current).toEqual(DEFAULT_PINS);
    act(() => pins.set(["hn", "nope" as "hn"]));
    expect(result.current).toEqual(["hn"]);
    localStorage.setItem("vj:feeds", '"garbage"');
    act(() => window.dispatchEvent(new StorageEvent("storage")));
    expect(result.current).toEqual(DEFAULT_PINS);
  });

  it("live filter accepts known categories only", () => {
    const { result } = renderHook(() => liveFilter.use());
    act(() => liveFilter.set("space"));
    expect(result.current).toBe("space");
    act(() => liveFilter.set("bogus"));
    expect(result.current).toBe("");
  });
});

describe("globeBus", () => {
  it("notifies subscribers with merged state", () => {
    const seen: number[] = [];
    const off = globeBus.subscribe((o) => seen.push(o.highlight.index));
    globeBus.set({ highlight: { index: 2, focus: true } });
    off();
    globeBus.set({ highlight: { index: 3, focus: false } });
    expect(seen).toEqual([2]);
    expect(globeBus.get().highlight.index).toBe(3);
  });

  it("loads quakes for the globe only when no card published them", async () => {
    const q = { mag: 5, place: "X", time: 1, url: null, lon: 0, lat: 0, depth: 1 };
    const load = vi.fn(async () =>
      Response.json({ ok: true, key: "eq", at: 1, data: { total: 1, events: [q] } }),
    );
    await ensureQuakes(load);
    expect(load).toHaveBeenCalledWith("/api/feeds/eq");
    expect(globeBus.get().quakes).toEqual([q]);
    await ensureQuakes(load);
    expect(load).toHaveBeenCalledTimes(1);
    globeBus.set({ quakes: [], quakeMeta: null });
    await ensureQuakes(async () => Response.json({ ok: false, key: "eq", at: 1, error: "x" }));
    await ensureQuakes(async () => {
      throw new Error("offline");
    });
    expect(globeBus.get().quakes).toEqual([]);
  });

  it("doesn't refetch on a quiet day with no quakes", async () => {
    globeBus.set({ quakes: [], quakeMeta: null });
    const load = vi.fn(async () =>
      Response.json({ ok: true, key: "eq", at: 1, data: { total: 0, events: [] } }),
    );
    await ensureQuakes(load);
    await ensureQuakes(load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(globeBus.get().quakeMeta).toEqual({ total: 0, at: 1 });
    globeBus.set({ quakeMeta: null });
  });
});
