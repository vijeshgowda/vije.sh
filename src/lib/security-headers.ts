/** Hosts the browser talks to directly. Everything else goes through this site's own origin. */
export const BROWSER_CONNECT_HOSTS = [
  "https://api.wheretheiss.at",
  "https://api.open-meteo.com",
  "https://geocoding-api.open-meteo.com",
] as const;

export const IMAGE_HOSTS = ["https://img.vije.sh"] as const;

/**
 * Baseline CSP for static pages. Static and partially prerendered pages can't carry a nonce, and
 * Next.js inlines its RSC payload as scripts, so script-src needs 'unsafe-inline' (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces").
 */
export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_HOSTS],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...BROWSER_CONNECT_HOSTS, ...(dev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(self), payment=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    ...(dev
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
