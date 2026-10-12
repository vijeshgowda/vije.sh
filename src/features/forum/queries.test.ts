import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
const { cacheLife } = await import("next/cache");
const { query } = await import("@/lib/db");
const { databaseReady } = await import("./queries");

describe("databaseReady", () => {
  it("is true for hours when the database answers", async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
    expect(await databaseReady()).toBe(true);
    expect(cacheLife).toHaveBeenLastCalledWith("hours");
  });

  it("is false for seconds when it doesn't, so prerendering defers to request time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(query).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await databaseReady()).toBe(false);
    vi.mocked(query).mockRejectedValueOnce("not configured");
    expect(await databaseReady()).toBe(false);
    expect(cacheLife).toHaveBeenLastCalledWith("seconds");
    expect(warn).toHaveBeenCalledWith("forum: database unavailable (ECONNREFUSED)");
    expect(warn).toHaveBeenCalledWith("forum: database unavailable (not configured)");
    warn.mockRestore();
  });
});
