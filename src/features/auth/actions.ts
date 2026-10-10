"use server";

import { headers } from "next/headers";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { completeOnboarding, HandleTakenError } from "./mutations";
import { PROVIDERS } from "./providers";
import { clientIp, requestHostname, requestOrigin } from "./request";
import { signInSchema, welcomeSchema } from "./schemas";
import { getCurrentUser } from "./session";

/** Starts the OAuth flow (PKCE; the verifier is stored in a cookie) and sends the browser on. */
export async function signIn(formData: FormData): Promise<void> {
  const parsed = signInSchema.safeParse({
    provider: formData.get("provider"),
    next: formData.get("next"),
  });
  if (!parsed.success) redirect("/login?error=provider");
  const { provider, next } = parsed.data;
  const p = PROVIDERS.find((x) => x.id === provider)!;

  const callback = new URL("/auth/callback", requestOrigin(await headers()));
  if (next !== "/") callback.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: p.id,
    options: { redirectTo: callback.href, scopes: "scopes" in p ? p.scopes : undefined },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url as Route); // the provider's consent page
}

export interface WelcomeState {
  /** Bumped on every submit so the form can re-render the single-use Turnstile widget */
  attempt: number;
  error?: string;
  field?: "handle" | "accept" | "token";
  handle?: string;
}

/** Onboarding: parse -> current user -> Turnstile -> set handle (application.md 8.4). */
export async function completeWelcome(
  prev: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const attempt = prev.attempt + 1;
  const handleInput = String(formData.get("handle") ?? "");
  const parsed = welcomeSchema.safeParse({
    handle: handleInput,
    accept: formData.get("accept"),
    token: formData.get("cf-turnstile-response") ?? "",
    next: formData.get("next"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const field = issue.path[0] as WelcomeState["field"];
    return { attempt, error: issue.message, field, handle: handleInput };
  }
  const { handle, token, next } = parsed.data;

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/welcome");
  if (user.onboarded) redirect(next);
  if (user.banned) return { attempt, error: "This account can't join the forum.", handle };

  const h = await headers();
  const human = await verifyTurnstile({
    token,
    action: "welcome",
    hostname: requestHostname(h),
    ip: clientIp(h),
  });
  if (!human) {
    return { attempt, error: "The human check failed. Please try again.", field: "token", handle };
  }

  try {
    await completeOnboarding(user.id, handle);
  } catch (err) {
    if (err instanceof HandleTakenError) {
      return { attempt, error: "That handle is taken.", field: "handle", handle };
    }
    throw err;
  }
  redirect(next);
}
