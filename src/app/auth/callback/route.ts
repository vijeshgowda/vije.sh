import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/features/auth/handle";
import { upsertProfile } from "@/features/auth/mutations";
import { loadCurrentUser } from "@/features/auth/queries";
import { profileFromMetadata } from "@/features/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth return (application.md 8.2): exchange the code for a session (cookies), create the profile
 * on first sign-in, then onboarding or back to the validated `next` path.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  if (!code) redirect("/login?error=callback");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) redirect("/login?error=callback");

  await upsertProfile({ id: data.user.id, ...profileFromMetadata(data.user.user_metadata) });
  const user = await loadCurrentUser(data.user.id);
  if (user?.onboarded) redirect(next);
  redirect(next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`);
}
