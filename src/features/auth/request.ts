/** Request facts the auth flow needs, read from headers (Vercel sets the x-forwarded-* ones). */

export function requestHost(h: Headers): string {
  return h.get("x-forwarded-host") ?? h.get("host") ?? "";
}

/** This site's origin as the browser sees it, so previews and localhost redirect to themselves. */
export function requestOrigin(h: Headers): string {
  const origin = h.get("origin");
  if (origin && origin !== "null") return origin;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${requestHost(h)}`;
}

export function requestHostname(h: Headers): string {
  return requestHost(h).replace(/:\d+$/, "");
}

export function clientIp(h: Headers): string | null {
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** True when a browser sent Origin and it is this host (CSRF check for plain POST routes). */
export function isSameOrigin(h: Headers): boolean {
  const origin = h.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === requestHost(h);
  } catch {
    return false;
  }
}
