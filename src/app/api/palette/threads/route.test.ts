import { describe, expect, it, vi } from "vitest";

const threads = [
  { id: "42", title: "Pooling", slug: "engineering", category: "Engineering", date: "2026-10-06" },
];
vi.mock("@/features/palette/threads", () => ({ paletteThreads: vi.fn(async () => threads) }));

const { GET } = await import("./route");

describe("GET /api/palette/threads", () => {
  it("returns the palette's threads as JSON", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threads });
  });
});
