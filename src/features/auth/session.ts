import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { assertAuthModeSafe, env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCurrentUser, type SessionUser } from "./queries";
import { TEST_SESSION_COOKIE, verifyTestSession } from "./test-session";

export const isTestAuth = () => process.env.AUTH_MODE === "test";

/**
 * The signed-in user's id: the `sub` of a JWT whose signature getClaims() checked against the
 * project's signing keys (never getSession(), which doesn't verify). With AUTH_MODE=test, the
 * signed test cookie instead (application.md 13.4).
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (isTestAuth()) {
    assertAuthModeSafe();
    const { TEST_AUTH_SECRET } = env("testAuth");
    const store = await cookies();
    return verifyTestSession(store.get(TEST_SESSION_COOKIE)?.value, TEST_AUTH_SECRET);
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

/** Profile, roles and ban status of the signed-in user; one lookup per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const id = await getCurrentUserId();
  return id ? loadCurrentUser(id) : null;
});
