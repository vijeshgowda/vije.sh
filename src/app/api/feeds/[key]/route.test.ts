import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/live/server/get-feed", () => ({
  getFeed: vi.fn(async (key: string) => ({ ok: true, key, at: 1, data: [] })),
}));

const { GET, generateStaticParams } = await import("./route");
const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

describe("GET /api/feeds/[key]", () => {
  it("prerenders every server feed", () => {
    const keys = generateStaticParams().map((p) => p.key);
    expect(keys).toContain("man");
    expect(keys).not.toContain("iss");
  });

  it("returns the cached feed", async () => {
    const res = await GET(new Request("http://x/api/feeds/hn"), ctx("hn"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, key: "hn" });
  });

  it("404s unknown and browser-only feeds", async () => {
    expect((await GET(new Request("http://x"), ctx("nope"))).status).toBe(404);
    expect((await GET(new Request("http://x"), ctx("iss"))).status).toBe(404);
  });
});
