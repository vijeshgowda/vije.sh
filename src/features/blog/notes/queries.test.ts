import { beforeEach, describe, expect, it, vi } from "vitest";

// The SQL runs against Postgres in notes.int.test.ts; this covers the cache wrappers' fallbacks.
const query = vi.fn();
const hasEnv = vi.fn();
const cacheLife = vi.fn();
const cacheTag = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => query(...a) }));
vi.mock("@/lib/env", () => ({ hasEnv: (...a: unknown[]) => hasEnv(...a) }));
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

const { getPublishedNote, listPublishedNoteSlugs, listPublishedNotes, getNoteById } =
  await import("./queries");

beforeEach(() => {
  vi.clearAllMocks();
  hasEnv.mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cached note reads", () => {
  it("serves no notes, cached for good, when no database is configured", async () => {
    hasEnv.mockReturnValue(false);
    expect(await listPublishedNotes()).toEqual([]);
    expect(await listPublishedNoteSlugs()).toEqual([]);
    expect(await getPublishedNote("a")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(cacheLife.mock.calls).toEqual([["max"], ["max"], ["max"]]);
  });

  it("serves no notes for a few minutes when the database fails", async () => {
    query.mockRejectedValue(new Error("paused"));
    expect(await listPublishedNotes()).toEqual([]);
    expect(await listPublishedNoteSlugs()).toEqual([]);
    expect(await getPublishedNote("a")).toBeNull();
    expect(cacheLife.mock.calls).toEqual([["minutes"], ["minutes"], ["minutes"]]);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("tags every read with `notes` and single notes with their slug", async () => {
    query.mockResolvedValue({ rows: [] });
    await listPublishedNotes();
    await getPublishedNote("a-note");
    expect(cacheTag.mock.calls).toEqual([["notes"], ["notes", "note:a-note"]]);
    expect(cacheLife.mock.calls).toEqual([["max"], ["max"]]);
  });

  it("never queries for a malformed slug or id", async () => {
    expect(await getPublishedNote("../etc")).toBeNull();
    expect(await getNoteById("1 or 1=1")).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
