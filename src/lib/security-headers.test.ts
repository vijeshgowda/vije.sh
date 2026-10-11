import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, headerRoutes, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("locks down production", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://api.wheretheiss.at");
    const keys = securityHeaders(false).map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("X-Content-Type-Options");
  });

  it("relaxes only what dev tooling needs", () => {
    const csp = contentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(securityHeaders(true).map((h) => h.key)).not.toContain("Strict-Transport-Security");
  });

  it("allows Turnstile only when asked", () => {
    expect(contentSecurityPolicy(false)).not.toContain("challenges.cloudflare.com");
    const csp = contentSecurityPolicy(false, { turnstile: true });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("gives Turnstile pages one CSP, not two", () => {
    const [general, welcome, ...rest] = headerRoutes(false);
    expect(rest).toEqual([]);
    expect(general!.source).toBe("/:path((?!(?:welcome)$).*)");
    expect(welcome!.source).toBe("/welcome");
    const csp = (r: typeof general) =>
      r!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp(welcome)).toContain("challenges.cloudflare.com");
    expect(csp(general)).not.toContain("challenges.cloudflare.com");
  });
});
