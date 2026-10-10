import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestSession } from "./test-session";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
}));
const loadCurrentUser = vi.fn();
vi.mock("./queries", () => ({ loadCurrentUser: (id: string) => loadCurrentUser(id) }));

const { getCurrentUser, getCurrentUserId, isTestAuth } = await import("./session");

const ID = "6f1c0a52-8d1e-4a43-9c55-0b7a3d9e2f10";
const SECRET = "s".repeat(32);

beforeEach(() => {
  jar.clear();
  getClaims.mockReset();
  loadCurrentUser.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("getCurrentUserId()", () => {
  it("returns the verified JWT subject", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: ID } } });
    expect(isTestAuth()).toBe(false);
    expect(await getCurrentUserId()).toBe(ID);
  });

  it("returns null without a valid session", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("no session") });
    expect(await getCurrentUserId()).toBeNull();
  });

  describe("with AUTH_MODE=test", () => {
    beforeEach(() => {
      vi.stubEnv("AUTH_MODE", "test");
      vi.stubEnv("TEST_AUTH_SECRET", SECRET);
    });

    it("reads the signed test cookie and never asks Supabase", async () => {
      jar.set("test_session", signTestSession(ID, SECRET));
      expect(await getCurrentUserId()).toBe(ID);
      jar.set("test_session", signTestSession(ID, "o".repeat(32)));
      expect(await getCurrentUserId()).toBeNull();
      expect(getClaims).not.toHaveBeenCalled();
    });

    it("refuses to run on Vercel", async () => {
      vi.stubEnv("VERCEL", "1");
      await expect(getCurrentUserId()).rejects.toThrow(/not allowed on Vercel/);
    });
  });
});

describe("getCurrentUser()", () => {
  it("loads the profile for the session user", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: ID } } });
    loadCurrentUser.mockResolvedValue({ id: ID, handle: "vije" });
    expect(await getCurrentUser()).toEqual({ id: ID, handle: "vije" });
    expect(loadCurrentUser).toHaveBeenCalledWith(ID);
  });

  it("is null for guests without touching the database", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await getCurrentUser()).toBeNull();
    expect(loadCurrentUser).not.toHaveBeenCalled();
  });
});
