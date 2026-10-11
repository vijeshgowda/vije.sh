import { cookies } from "next/headers";
import { isSameOrigin } from "@/features/auth/request";
import { isTestAuth } from "@/features/auth/session";
import { TEST_SESSION_COOKIE } from "@/features/auth/test-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST only (application.md 8.5): clears the session cookies, revokes the refresh token, goes home. */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) return new Response(null, { status: 403 });
  if (isTestAuth()) {
    (await cookies()).delete(TEST_SESSION_COOKIE);
  } else {
    await (await createSupabaseServerClient()).auth.signOut();
  }
  // 303 so the browser follows with a GET
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
