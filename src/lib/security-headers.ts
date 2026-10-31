/** Hosts the browser talks to directly. Everything else goes through this site's own origin. */
export const BROWSER_CONNECT_HOSTS = [
  "https://api.wheretheiss.at",
  "https://api.open-meteo.com",
  "https://geocoding-api.open-meteo.com",
] as const;

export const IMAGE_HOSTS = ["https://img.vije.sh"] as const;

/** Cloudflare Turnstile's script and iframe; allowed only on pages that render the widget. */
export const TURNSTILE_HOST = "https://challenges.cloudflare.com";

/** Pages with a Turnstile widget. They get only the Turnstile CSP (next.config.ts). */
export const TURNSTILE_PAGES = ["/welcome"] as const;

export interface CspOptions {
  turnstile?: boolean;
  omniSignalingUrl?: string;
}

/** Pages that make Omni calls. They get camera/microphone and the signalling WebSocket. */
export const OMNI_CALL_PAGES = ["/lab/omni"] as const;

function websocketOrigin(signalingUrl: string): string {
  const signaling = new URL(signalingUrl);
  if (signaling.protocol !== "ws:" && signaling.protocol !== "wss:") {
    throw new TypeError("Omni signalling URL must use ws: or wss:");
  }
  return signaling.origin;
}

/**
 * Baseline CSP for static pages. Static and partially prerendered pages can't carry a nonce, and
 * Next.js inlines its RSC payload as scripts, so script-src needs 'unsafe-inline' (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces").
 */
export function contentSecurityPolicy(
  dev: boolean,
  { turnstile = false, omniSignalingUrl }: CspOptions = {},
): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...(turnstile ? [TURNSTILE_HOST] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...IMAGE_HOSTS],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      ...BROWSER_CONNECT_HOSTS,
      ...(omniSignalingUrl ? [websocketOrigin(omniSignalingUrl)] : []),
      ...(dev ? ["ws:"] : []),
    ],
    ...(omniSignalingUrl ? { "media-src": ["'self'", "blob:"] } : {}),
    ...(turnstile ? { "frame-src": [TURNSTILE_HOST] } : {}),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(
  dev: boolean,
  options: CspOptions = {},
): { key: string; value: string }[] {
  const omniCall = options.omniSignalingUrl !== undefined;
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev, options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: omniCall
        ? "camera=(self), microphone=(self), display-capture=(self), geolocation=(self), payment=()"
        : "camera=(), microphone=(), geolocation=(self), payment=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    ...(dev
      ? []
      : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}

/**
 * Special pages are excluded from the general rule because duplicate CSP headers are intersected
 * by browsers and the stricter policy would still block the required feature.
 */
export function headerRoutes(dev: boolean, omniSignalingUrl: string) {
  const pages = [...TURNSTILE_PAGES, ...OMNI_CALL_PAGES].map((p) => p.slice(1)).join("|");
  return [
    { source: `/:path((?!(?:${pages})$).*)`, headers: securityHeaders(dev) },
    ...TURNSTILE_PAGES.map((source) => ({
      source,
      headers: securityHeaders(dev, { turnstile: true }),
    })),
    ...OMNI_CALL_PAGES.map((source) => ({
      source,
      headers: securityHeaders(dev, { omniSignalingUrl }),
    })),
  ];
}
