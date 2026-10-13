import { describe, expect, it, vi } from "vitest";

const forum = vi.hoisted(() => ({ databaseReady: vi.fn(), listLatestThreads: vi.fn() }));
vi.mock("@/features/forum/queries", () => forum);

const { paletteThreads } = await import("./threads");
const { PALETTE_THREADS } = await import("./items");

const summary = (id: number) => ({
  id: String(id),
  title: `Thread ${id}`,
  category: { slug: "engineering", name: "Engineering" },
  authorHandle: "ada",
  replyCount: 2,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  lastActivityAt: new Date("2026-10-06T23:59:00Z"),
  pinned: false,
  locked: false,
});

describe("paletteThreads", () => {
  it("maps the latest threads to the palette payload, capped", async () => {
    forum.databaseReady.mockResolvedValue(true);
    forum.listLatestThreads.mockResolvedValue(
      Array.from({ length: PALETTE_THREADS + 3 }, (_, i) => summary(i + 1)),
    );
    const threads = await paletteThreads();
    expect(threads).toHaveLength(PALETTE_THREADS);
    expect(threads[0]).toEqual({
      id: "1",
      title: "Thread 1",
      slug: "engineering",
      category: "Engineering",
      date: "2026-10-06",
    });
  });

  it("is empty without a database", async () => {
    forum.databaseReady.mockResolvedValue(false);
    forum.listLatestThreads.mockClear();
    expect(await paletteThreads()).toEqual([]);
    expect(forum.listLatestThreads).not.toHaveBeenCalled();
  });
});
