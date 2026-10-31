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

  it("gives special pages one CSP, not two", () => {
    const [general, welcome, omni, ...rest] = headerRoutes(false, "wss://omni-8t2t.onrender.com");
    expect(rest).toEqual([]);
    expect(general!.source).toBe("/:path((?!(?:welcome|lab/omni)$).*)");
    expect(welcome!.source).toBe("/welcome");
    expect(omni!.source).toBe("/lab/omni");
    const csp = (r: typeof general) =>
      r!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp(welcome)).toContain("challenges.cloudflare.com");
    expect(csp(general)).not.toContain("challenges.cloudflare.com");
    for (const route of [general, welcome]) {
      expect(csp(route)).not.toContain("onrender.com");
      expect(csp(route)).not.toContain("media-src");
      expect(route!.headers.find((h) => h.key === "Permissions-Policy")!.value).toContain(
        "camera=(), microphone=()",
      );
    }
    expect(csp(omni)).toContain(
      "connect-src 'self' https://api.wheretheiss.at https://api.open-meteo.com https://geocoding-api.open-meteo.com wss://omni-8t2t.onrender.com;",
    );
    expect(csp(omni)).not.toContain("https://omni-8t2t.onrender.com");
    expect(csp(omni)).toContain("media-src 'self' blob:");
    expect(csp(omni)).not.toContain("worker-src");
    expect(csp(omni).match(/connect-src/g)).toHaveLength(1);
    expect(omni!.headers.find((h) => h.key === "Permissions-Policy")!.value).toContain(
      "camera=(self), microphone=(self), display-capture=(self)",
    );
  });

  it("builds the Omni connect-src from the configured signalling URL", () => {
    const omni = headerRoutes(false, "ws://localhost:8765")[2]!;
    const csp = omni.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("ws://localhost:8765");
    expect(csp).not.toContain("http://localhost:8765");
    expect(() => headerRoutes(false, "https://example.com")).toThrow(
      "Omni signalling URL must use ws: or wss:",
    );
  });
});
