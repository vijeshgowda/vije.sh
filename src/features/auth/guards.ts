import "server-only";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { can, type Action, type Ctx } from "@/lib/authz";
import type { SessionUser } from "./queries";
import { getCurrentUser } from "./session";

/** The sign-in page, returning to `next` (a path on this site) afterwards. */
export function loginHref(next: string): Route {
  return `/login?next=${encodeURIComponent(next)}` as Route;
}

/**
 * The signed-in user, or a redirect to sign-in that comes back to `next`. Reads the session, so
 * call it under <Suspense> or in a segment with `instant = false` (src/app/(site)/admin/layout.tsx).
 */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(next));
  return user;
}

/**
 * The user, if can(user, action, ctx); otherwise a 404, so staff pages don't reveal that they
 * exist. Guests get the 404 too: use requirePage() where they should be asked to sign in.
 */
export async function requireCan(action: Action, ctx?: Ctx): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !can(user, action, ctx)) notFound();
  return user;
}

/** Guard for a gated page: guests sign in and come back to `next`; anyone else not allowed gets a 404. */
export async function requirePage(next: string, action: Action, ctx?: Ctx): Promise<SessionUser> {
  await requireUser(next);
  return requireCan(action, ctx);
}
