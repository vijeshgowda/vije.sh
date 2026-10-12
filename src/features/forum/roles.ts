import { highestRole, ROLE_LABEL, type Role, type RoleGrant } from "@/lib/authz";

/** The role shown next to an author's name: a staff role, or "member" for everyone else. */
export type DisplayRole = Role | "member";

/** Pill text: the owner (stored as `admin`) shows as "Owner". */
export const ROLE_PILL_LABEL: Record<DisplayRole, string> = { ...ROLE_LABEL, member: "Member" };

/**
 * The highest grant that applies in this category. A category moderator shows as a moderator only
 * in their own category; every other grant is global.
 */
export function displayRole(
  grants: readonly Pick<RoleGrant, "role" | "categoryId">[],
  categoryId: string,
): DisplayRole {
  const applicable = grants.filter(
    (g) => g.role !== "moderator" || g.categoryId === null || g.categoryId === categoryId,
  );
  return highestRole(applicable.map((g) => g.role)) ?? "member";
}
