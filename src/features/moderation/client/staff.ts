import { isGlobalModerator, isSuperuser, moderates, type HasRoles } from "@/lib/authz";

/**
 * Browser-side scope rules for the staff islands. They only decide what to show; every action
 * checks again on the server with can().
 */

/** Holds any staff grant (owner, superuser or a moderator somewhere) */
export const hasStaffGrant = (u: HasRoles) => u.roles.length > 0;

/**
 * May move a thread out of this category: moderates it and at least one other category (a
 * moderator of one category has nowhere to move it).
 */
export function mayMoveFrom(u: HasRoles, categoryId: string): boolean {
  if (!moderates(u, categoryId)) return false;
  return (
    isSuperuser(u) ||
    isGlobalModerator(u) ||
    u.roles.some((r) => r.role === "moderator" && r.categoryId !== categoryId)
  );
}
