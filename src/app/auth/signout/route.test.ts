import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const del = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: del }) }));
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut } }),
}));

const { POST } = await import("./route");

const post = (origin?: string) =>
  POST(
    new Request("https://vije.sh/auth/signout", {
      method: "POST",
      headers: { host: "vije.sh", ...(origin ? { origin } : {}) },
    }),
  );

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("POST /auth/signout", () => {
  it("rejects cross-site and Origin-less posts", async () => {
    expect((await post("https://evil.example")).status).toBe(403);
    expect((await post()).status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out of Supabase and redirects home with 303", async () => {
    const res = await post("https://vije.sh");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(signOut).toHaveBeenCalled();
  });

  it("clears the test cookie in test mode", async () => {
    vi.stubEnv("AUTH_MODE", "test");
    expect((await post("https://vije.sh")).status).toBe(303);
    expect(del).toHaveBeenCalledWith("test_session");
    expect(signOut).not.toHaveBeenCalled();
  });
});
