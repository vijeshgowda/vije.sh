import { moderates, type CurrentUser } from "@/lib/authz";
import type { Me } from "@/features/auth/components/UserMenu";

/**
 * Browser-side posting rules for islands. They only decide what to show; every action checks
 * again on the server. Islands never see user ids, so authors are matched by handle.
 */

/** Why this visitor can't post at all, or null for a member */
export type PostingBlock = "guest" | "unonboarded" | "banned";

export function postingBlock(me: Me | null): PostingBlock | null {
  if (!me) return "guest";
  if (!me.onboarded) return "unonboarded";
  if (me.banned) return "banned";
  return null;
}

/** Handles are unique in any letter case; this is the id islands use for an author. */
export const handleKey = (handle: string | null) => (handle ? `@${handle.toLowerCase()}` : null);

/**
 * /api/me as a CurrentUser for can(), with the handle standing in for the id: pass
 * `authorId: handleKey(frame.authorHandle)` in the context.
 */
export function meAsUser(me: Me): CurrentUser {
  return {
    id: handleKey(me.handle) ?? "",
    handle: me.handle,
    onboarded: me.onboarded,
    banned: me.banned,
    roles: me.grants,
  };
}

/** Categories this visitor may start a thread in: staff-only ones only for their staff. */
export function postableCategories<C extends { id: string; staffOnly: boolean }>(
  categories: readonly C[],
  me: Me,
): C[] {
  return categories.filter((c) => !c.staffOnly || moderates({ roles: me.grants }, c.id));
}
