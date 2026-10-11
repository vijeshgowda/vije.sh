import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirect extends Error {
  constructor(public url: string) {
    super(url);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
const upsertProfile = vi.fn();
vi.mock("@/features/auth/mutations", () => ({ upsertProfile: (p: unknown) => upsertProfile(p) }));
const loadCurrentUser = vi.fn();
vi.mock("@/features/auth/queries", () => ({
  loadCurrentUser: (id: string) => loadCurrentUser(id),
}));

const { GET } = await import("./route");

const call = (qs: string) =>
  GET(new NextRequest(`https://vije.sh/auth/callback${qs}`)).then(
    () => "no redirect",
    (e: unknown) => (e instanceof Redirect ? e.url : Promise.reject(e)),
  );

const user = { id: "u1", user_metadata: { full_name: "Ada", avatar_url: "https://a.example/a" } };

beforeEach(() => vi.clearAllMocks());

describe("GET /auth/callback", () => {
  it("needs a code", async () => {
    expect(await call("")).toBe("/login?error=callback");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("returns to /login when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    expect(await call("?code=c")).toBe("/login?error=callback");
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("creates the profile and sends new users to /welcome with next", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user }, error: null });
    loadCurrentUser.mockResolvedValue({ id: "u1", onboarded: false });
    expect(await call("?code=c&next=/forum")).toBe("/welcome?next=%2Fforum");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("c");
    expect(upsertProfile).toHaveBeenCalledWith({
      id: "u1",
      displayName: "Ada",
      avatarUrl: "https://a.example/a",
    });
    expect(await call("?code=c")).toBe("/welcome");
  });

  it("sends onboarded users to a safe next path", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user }, error: null });
    loadCurrentUser.mockResolvedValue({ id: "u1", onboarded: true });
    expect(await call("?code=c&next=/blog")).toBe("/blog");
    expect(await call("?code=c&next=//evil.example")).toBe("/");
  });
});
