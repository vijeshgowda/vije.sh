import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Test sign-in (application.md 13.4): with AUTH_MODE=test the session is a cookie holding
 * `<user id>.<HMAC-SHA256(user id)>`. No "server-only" import: Playwright fixtures sign cookies too.
 */
export const TEST_SESSION_COOKIE = "test_session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mac = (userId: string, secret: string) =>
  createHmac("sha256", secret).update(userId).digest("base64url");

export function signTestSession(userId: string, secret: string): string {
  return `${userId}.${mac(userId, secret)}`;
}

/** The user id when the cookie is well-formed and signed with `secret`, otherwise null. */
export function verifyTestSession(value: string | undefined, secret: string): string | null {
  const dot = value?.indexOf(".") ?? -1;
  if (!value || dot < 0) return null;
  const userId = value.slice(0, dot);
  if (!UUID.test(userId)) return null;
  const got = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(mac(userId, secret));
  return got.length === want.length && timingSafeEqual(got, want) ? userId : null;
}
