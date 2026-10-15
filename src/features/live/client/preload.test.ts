import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreload, wantsLessData, whenIdle } from "./preload";

const nav = (connection?: object) => ({ connection }) as unknown as Navigator;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("wantsLessData", () => {
  it("is true for data saver and 2G, false otherwise", () => {
    expect(wantsLessData(nav({ saveData: true }))).toBe(true);
    expect(wantsLessData(nav({ effectiveType: "slow-2g" }))).toBe(true);
    expect(wantsLessData(nav({ effectiveType: "2g" }))).toBe(true);
    expect(wantsLessData(nav({ effectiveType: "4g", saveData: false }))).toBe(false);
    expect(wantsLessData(nav())).toBe(false);
    expect(wantsLessData(undefined)).toBe(false);
  });

  it("honours prefers-reduced-data", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-data") }));
    expect(wantsLessData(nav({ effectiveType: "4g" }))).toBe(true);
  });
});

describe("whenIdle", () => {
  it("uses requestIdleCallback with a deadline, and cancels it", () => {
    const ric = vi.fn((_fn: () => void, _o: object) => 7);
    const cic = vi.fn();
    vi.stubGlobal("requestIdleCallback", ric);
    vi.stubGlobal("cancelIdleCallback", cic);
    const fn = vi.fn();
    const cancel = whenIdle(fn, 1500);
    expect(ric).toHaveBeenCalledWith(fn, { timeout: 1500 });
    cancel();
    expect(cic).toHaveBeenCalledWith(7);
  });

  it("falls back to a short timeout without requestIdleCallback", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    whenIdle(fn, 2000);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();

    const later = vi.fn();
    whenIdle(later)();
    vi.advanceTimersByTime(1000);
    expect(later).not.toHaveBeenCalled();
  });
});

describe("createPreload", () => {
  it("runs its tasks once, when idle", () => {
    vi.useFakeTimers();
    const schedule = createPreload();
    const task = vi.fn();
    schedule([task]);
    expect(task).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(task).toHaveBeenCalledOnce();
    schedule([task]);
    vi.runAllTimers();
    expect(task).toHaveBeenCalledOnce();
  });

  it("can be scheduled again when cancelled before it started (dev double-mount)", () => {
    vi.useFakeTimers();
    const schedule = createPreload();
    const task = vi.fn();
    schedule([task])();
    vi.runAllTimers();
    expect(task).not.toHaveBeenCalled();
    schedule([task]);
    vi.runAllTimers();
    expect(task).toHaveBeenCalledOnce();
  });

  it("skips everything on data saver", () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", nav({ saveData: true }));
    const task = vi.fn();
    createPreload()([task]);
    vi.runAllTimers();
    expect(task).not.toHaveBeenCalled();
  });

  it("keeps going past a task that throws or rejects", async () => {
    vi.useFakeTimers();
    const last = vi.fn();
    createPreload()([
      () => {
        throw new Error("sync");
      },
      () => Promise.reject(new Error("async")),
      last,
    ]);
    vi.runAllTimers();
    await Promise.resolve();
    expect(last).toHaveBeenCalledOnce();
  });
});
