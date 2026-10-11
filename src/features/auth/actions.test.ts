import { beforeEach, describe, expect, it, vi } from "vitest";

class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
let hdrs = new Headers();
vi.mock("next/headers", () => ({ headers: async () => hdrs }));
const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOAuth } }),
}));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (c: unknown) => verifyTurnstile(c) }));
const getCurrentUser = vi.fn();
vi.mock("./session", () => ({ getCurrentUser: () => getCurrentUser() }));
const completeOnboarding = vi.fn();
vi.mock("./mutations", async (orig) => ({
  ...(await orig<typeof import("./mutations")>()),
  completeOnboarding: (id: string, h: string) => completeOnboarding(id, h),
}));

const { HandleTakenError } = await import("./mutations");
const { completeWelcome, signIn } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function redirectOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof Redirect)) throw new Error(`expected a redirect, got ${String(err)}`);
  return err.url;
}

beforeEach(() => {
  vi.clearAllMocks();
  hdrs = new Headers({ origin: "https://vije.sh", host: "vije.sh", "x-real-ip": "1.2.3.4" });
});

describe("signIn", () => {
  it("starts PKCE OAuth with a callback on this origin and sends the browser to the provider", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://github.com/login/oauth" },
      error: null,
    });
    const url = await redirectOf(signIn(form({ provider: "github", next: "/forum" })));
    expect(url).toBe("https://github.com/login/oauth");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: "https://vije.sh/auth/callback?next=%2Fforum", scopes: undefined },
    });
  });

  it("asks Microsoft for the email scope and omits next=/", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: "https://login.microsoftonline.com" } });
    await redirectOf(signIn(form({ provider: "azure", next: "https://evil.example" })));
    expect(signInWithOAuth.mock.calls[0]![0]).toEqual({
      provider: "azure",
      options: { redirectTo: "https://vije.sh/auth/callback", scopes: "email" },
    });
  });

  it("rejects unknown providers", async () => {
    expect(await redirectOf(signIn(form({ provider: "apple" })))).toBe("/login?error=provider");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("returns to /login when Supabase fails", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error("x") });
    expect(await redirectOf(signIn(form({ provider: "google" })))).toBe("/login?error=oauth");
  });
});

describe("completeWelcome", () => {
  const ok = { handle: "vije", accept: "on", "cf-turnstile-response": "tok", next: "/lab" };
  const member = { id: "u1", onboarded: false, banned: false };

  it("returns field errors before touching the session", async () => {
    const state = await completeWelcome({ attempt: 2 }, form({ ...ok, handle: "no spaces" }));
    expect(state).toMatchObject({ attempt: 3, field: "handle", handle: "no spaces" });
    expect((await completeWelcome({ attempt: 0 }, form({ handle: "vije" }))).field).toBe("accept");
    expect(await completeWelcome({ attempt: 0 }, new FormData())).toMatchObject({
      field: "handle",
      handle: "",
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("sends guests to sign in and members who already onboarded on to next", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect(await redirectOf(completeWelcome({ attempt: 0 }, form(ok)))).toBe(
      "/login?next=/welcome",
    );
    getCurrentUser.mockResolvedValueOnce({ ...member, onboarded: true });
    expect(await redirectOf(completeWelcome({ attempt: 0 }, form(ok)))).toBe("/lab");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("refuses banned accounts", async () => {
    getCurrentUser.mockResolvedValue({ ...member, banned: true });
    expect((await completeWelcome({ attempt: 0 }, form(ok))).error).toMatch(/can't join/);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("checks Turnstile for this host and action", async () => {
    getCurrentUser.mockResolvedValue(member);
    verifyTurnstile.mockResolvedValue(false);
    const state = await completeWelcome({ attempt: 0 }, form(ok));
    expect(state).toMatchObject({ field: "token", handle: "vije" });
    expect(verifyTurnstile).toHaveBeenCalledWith({
      token: "tok",
      action: "welcome",
      hostname: "vije.sh",
      ip: "1.2.3.4",
    });
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("sets the handle and redirects to next", async () => {
    getCurrentUser.mockResolvedValue(member);
    verifyTurnstile.mockResolvedValue(true);
    completeOnboarding.mockResolvedValue(true);
    expect(await redirectOf(completeWelcome({ attempt: 0 }, form(ok)))).toBe("/lab");
    expect(completeOnboarding).toHaveBeenCalledWith("u1", "vije");
  });

  it("reports a taken handle and rethrows other errors", async () => {
    getCurrentUser.mockResolvedValue(member);
    verifyTurnstile.mockResolvedValue(true);
    completeOnboarding.mockRejectedValueOnce(new HandleTakenError());
    expect(await completeWelcome({ attempt: 0 }, form(ok))).toMatchObject({
      field: "handle",
      error: "That handle is taken.",
    });
    completeOnboarding.mockRejectedValueOnce(new Error("db down"));
    await expect(completeWelcome({ attempt: 0 }, form(ok))).rejects.toThrow("db down");
  });

  it("treats a missing token as an empty one", async () => {
    const { "cf-turnstile-response": _, ...rest } = ok;
    expect((await completeWelcome({ attempt: 0 }, form(rest))).field).toBe("token");
  });
});
