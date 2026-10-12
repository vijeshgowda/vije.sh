import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("./route");

const SECRET = "x".repeat(32);
const post = (body: unknown, secret: string | null = SECRET) =>
  POST(
    new Request("http://localhost/api/test/revalidate", {
      method: "POST",
      headers: secret === null ? {} : { "x-test-secret": secret },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.stubEnv("AUTH_MODE", "test");
  vi.stubEnv("TEST_AUTH_SECRET", SECRET);
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  revalidateTag.mockClear();
});

describe("POST /api/test/revalidate", () => {
  it("doesn't exist outside test mode", async () => {
    vi.stubEnv("AUTH_MODE", "");
    expect((await post({ tags: ["notes"] })).status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses to run on Vercel even in test mode", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(post({ tags: ["notes"] })).rejects.toThrow(/not allowed on Vercel/);
  });

  it("needs the test secret", async () => {
    expect((await post({ tags: ["notes"] }, null)).status).toBe(403);
    expect((await post({ tags: ["notes"] }, "y".repeat(32))).status).toBe(403);
    expect((await post({ tags: ["notes"] }, "short")).status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ tags: [] })).status).toBe(400);
    expect((await post({ tags: [""] })).status).toBe(400);
  });

  it("expires each tag immediately", async () => {
    expect((await post({ tags: ["notes", "note:a"] })).status).toBe(204);
    expect(revalidateTag.mock.calls).toEqual([
      ["notes", { expire: 0 }],
      ["note:a", { expire: 0 }],
    ]);
  });
});
