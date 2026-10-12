import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type SetAll = (
  list: { name: string; value: string; options: object }[],
  headers: Record<string, string>,
) => void;
let setAll: SetAll | undefined;
const getClaims = vi.fn(async () => {
  setAll?.([{ name: "sb-ref-auth-token", value: "fresh", options: { path: "/" } }], {
    "Cache-Control": "private, no-store",
  });
  return { data: null };
});
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, o: { cookies: { setAll: SetAll } }) => {
    setAll = o.cookies.setAll;
    return { auth: { getClaims } };
  },
}));

const { proxy, config } = await import("./proxy");
const req = () => new NextRequest("https://vije.sh/welcome");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  setAll = undefined;
});

describe("proxy", () => {
  it("runs only on the dynamic auth routes", () => {
    expect(config.matcher).toEqual(["/admin/:path*", "/welcome", "/auth/:path*", "/login"]);
  });

  it("passes through when Supabase isn't configured or in test mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await proxy(req());
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    vi.stubEnv("AUTH_MODE", "test");
    await proxy(req());
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("sends visitors without a session from /admin to sign-in, keeping the path", async () => {
    for (const path of ["/admin", "/admin/members?q=a"]) {
      const res = await proxy(new NextRequest(`https://vije.sh${path}`));
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("next")).toBe(path);
    }
    vi.stubEnv("AUTH_MODE", "test");
    const signedIn = new NextRequest("https://vije.sh/admin", {
      headers: { cookie: "test_session=x" },
    });
    expect((await proxy(signedIn)).headers.get("location")).toBeNull();
    expect((await proxy(new NextRequest("https://vije.sh/administrator"))).status).toBe(200);
  });

  it("refreshes the session and writes the new cookies with no-store", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    const res = await proxy(req());
    expect(getClaims).toHaveBeenCalled();
    expect(res.cookies.get("sb-ref-auth-token")?.value).toBe("fresh");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
