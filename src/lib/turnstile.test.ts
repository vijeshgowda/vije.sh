import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_TEST_SECRET, verifyTurnstile } from "./turnstile";

const SECRET = "0x-real-secret";
const check = { token: "tok", action: "welcome", hostname: "vije.sh", ip: "1.2.3.4" };

function cloudflare(result: object, status = 200) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(result, { status }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyTurnstile()", () => {
  it("posts the secret, token and IP to siteverify and checks action and hostname", async () => {
    const fetch = cloudflare({ success: true, action: "welcome", hostname: "vije.sh" });
    expect(await verifyTurnstile(check, SECRET)).toBe(true);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init!.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      secret: SECRET,
      response: "tok",
      remoteip: "1.2.3.4",
    });
  });

  it("leaves out an unknown IP", async () => {
    const fetch = cloudflare({ success: true, action: "welcome", hostname: "vije.sh" });
    await verifyTurnstile({ ...check, ip: null }, SECRET);
    expect((fetch.mock.calls[0]![1]!.body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it.each([
    [{ success: false, action: "welcome", hostname: "vije.sh" }],
    [{ success: true, action: "other", hostname: "vije.sh" }],
    [{ success: true, action: "welcome", hostname: "evil.example" }],
    [{}],
  ])("rejects %j", async (result) => {
    cloudflare(result);
    expect(await verifyTurnstile(check, SECRET)).toBe(false);
  });

  it("fails closed on HTTP and network errors", async () => {
    cloudflare({ success: true }, 500);
    expect(await verifyTurnstile(check, SECRET)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await verifyTurnstile(check, SECRET)).toBe(false);
  });

  it("rejects missing or oversized tokens without calling Cloudflare", async () => {
    const fetch = cloudflare({ success: true });
    expect(await verifyTurnstile({ ...check, token: "" }, SECRET)).toBe(false);
    expect(await verifyTurnstile({ ...check, token: "t".repeat(2049) }, SECRET)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers locally for Cloudflare's always-pass test secret", async () => {
    const fetch = cloudflare({});
    expect(await verifyTurnstile(check, TURNSTILE_TEST_SECRET)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the secret from the environment by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET);
    expect(await verifyTurnstile(check)).toBe(true);
  });
});
