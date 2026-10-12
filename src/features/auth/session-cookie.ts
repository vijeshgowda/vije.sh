/** Session-cookie sniffing for code that can't verify the session itself (the browser, Proxy). */

// Supabase's session cookie (chunked as .0, .1 when large) or the test-mode cookie
const SESSION_COOKIE = /(?:^|;\s*)(?:sb-[^=;]+-auth-token(?:\.\d+)?|test_session)=/;

/**
 * True when a Cookie header (or document.cookie) holds a session cookie. Presence only: the server
 * still verifies it, so a false positive just costs one /api/me call or a later redirect.
 */
export function hasSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE.test(cookie);
}
