import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage";
import { createStoredValue } from "./stored-value";
import { bootUart, uart, useUart } from "./uart";

afterEach(() => vi.useRealTimers());

describe("storage", () => {
  it("prefixes keys and round-trips JSON", () => {
    storage.set("k", { a: 1 });
    expect(localStorage.getItem("vj:k")).toBe('{"a":1}');
    expect(storage.get("k", null)).toEqual({ a: 1 });
    storage.remove("k");
    expect(storage.get("k", "fallback")).toBe("fallback");
  });

  it("survives broken JSON and a throwing localStorage", () => {
    localStorage.setItem("vj:bad", "{");
    expect(storage.get("bad", 7)).toBe(7);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => storage.set("x", 1)).not.toThrow();
    spy.mockRestore();
    const rm = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => storage.remove("x")).not.toThrow();
    rm.mockRestore();
  });
});

describe("createStoredValue", () => {
  it("serves the fallback, validates, and updates subscribers", () => {
    const v = createStoredValue<number>("n", 1, (x) => (typeof x === "number" ? x : 1));
    const { result } = renderHook(() => v.use());
    expect(result.current).toBe(1);
    act(() => v.set(5));
    expect(result.current).toBe(5);
    localStorage.setItem("vj:n", '"nope"');
    act(() => {
      window.dispatchEvent(new StorageEvent("storage"));
    });
    expect(result.current).toBe(1);
    expect(v.get()).toBe(1);
  });

  it("falls back when localStorage is unavailable", () => {
    const v = createStoredValue("m", "d");
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(v.get()).toBe("d");
    spy.mockRestore();
  });
});

describe("uart", () => {
  function Console() {
    const { lines } = useUart();
    return <pre>{lines.join("|")}</pre>;
  }

  it("logs lines, keeps the last 30 and boots once", () => {
    vi.useFakeTimers();
    render(<Console />);
    act(() => bootUart(["a", "b"], 100));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/a\|b/)).toBeInTheDocument();
    act(() => bootUart(["again"], 0));
    act(() => {
      for (let i = 0; i < 40; i++) uart(`l${i}`);
    });
    const text = screen.getByText(/l39/).textContent!;
    expect(text.split("|")).toHaveLength(30);
    expect(text).not.toContain("again");
  });
});
