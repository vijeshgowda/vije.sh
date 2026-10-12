import type { Role, RoleGrant } from "@/lib/authz";

/** The role shown next to an author's name: a staff role, or "member" for everyone else. */
export type DisplayRole = Role | "member";

/** Higher wins when someone holds several grants */
const RANK: Record<Role, number> = { admin: 2, moderator: 1 };

/** Pill text. When authz gains ROLE_LABEL, this becomes `{ ...ROLE_LABEL, member: "Member" }`. */
export const ROLE_PILL_LABEL: Record<DisplayRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  member: "Member",
};

/**
 * The highest grant that applies in this category. A category moderator shows as a moderator only
 * in their own category; every other grant is global.
 */
export function displayRole(
  grants: readonly Pick<RoleGrant, "role" | "categoryId">[],
  categoryId: string,
): DisplayRole {
  let best: Role | null = null;
  for (const g of grants) {
    if (g.role === "moderator" && g.categoryId !== null && g.categoryId !== categoryId) continue;
    if (best === null || RANK[g.role] > RANK[best]) best = g.role;
  }
  return best ?? "member";
}
