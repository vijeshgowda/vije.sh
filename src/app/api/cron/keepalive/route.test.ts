import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/features/system/queries", () => ({ ping: vi.fn(async () => 5) }));

const { ping } = await import("@/features/system/queries");
const { GET } = await import("./route");

const SECRET = "s3cret-s3cret-s3cret";
const req = (auth?: string) =>
  new Request("http://x/api/cron/keepalive", { headers: auth ? { authorization: auth } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/keepalive", () => {
  it("is unavailable until configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req())).status).toBe(503);
  });

  describe("when configured", () => {
    const configure = () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/x");
    };

    it("rejects a missing or wrong secret", async () => {
      configure();
      expect((await GET(req())).status).toBe(401);
      expect((await GET(req("Bearer wrong-wrong-wrong-wro"))).status).toBe(401);
    });

    it("pings the database with the right secret", async () => {
      configure();
      const res = await GET(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, categories: 5 });
    });

    it("reports database failures without details", async () => {
      configure();
      vi.mocked(ping).mockRejectedValueOnce(new Error("password authentication failed"));
      const res = await GET(req(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ ok: false, error: "database" });
    });
  });
});
