/**
 * Client-safe rules for /admin/members: which controls a staff user gets on a member's page. The
 * permission itself is can() in src/lib/authz.ts (application.md 8.7); the Server Actions check it
 * again, and the mutations re-check it with the target's roles read under a row lock.
 */
import type { Route } from "next";
import { can, type CurrentUser, type Role } from "@/lib/authz";

export const MEMBERS_PER_PAGE = 50;

/** The roles the app may grant or revoke; the owner (`admin`) is granted by hand in SQL only. */
export const STAFF_ROLES = ["superuser", "moderator"] as const satisfies readonly Role[];
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Ban lengths offered by the form ("" = permanent); the expiry is computed in SQL from now(). */
export const BAN_DURATIONS = [
  { value: "", label: "Permanent" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const;

/** /admin/members with a search and page (both left out when empty or 1). */
export function membersHref(q: string, page = 1): Route {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (qs ? `/admin/members?${qs}` : "/admin/members") as Route;
}

/** A member's admin page. */
export const memberHref = (handle: string) =>
  `/admin/members/${encodeURIComponent(handle)}` as Route;

export interface Target {
  id: string;
  roles: readonly Role[];
}

/** Why a grant makes no sense even though it's allowed, or null. */
export function grantProblem(targetRoles: readonly Role[], role: Role): string | null {
  if (role === "moderator" && targetRoles.includes("superuser")) {
    return "Superusers already moderate every category.";
  }
  if (role === "superuser" && targetRoles.includes("superuser")) {
    return "They're already a superuser.";
  }
  return null;
}

const ctx = (t: Target, grantRole?: Role) => ({
  targetId: t.id,
  targetRoles: t.roles,
  grantRole,
});

/** May `user` grant `role` to the target, and does the grant make sense? */
export function mayGrant(user: CurrentUser | null, t: Target, role: Role): boolean {
  return can(user, "role.grant", ctx(t, role)) && !grantProblem(t.roles, role);
}

/** May `user` revoke `role` from the target? (role.grant covers both directions.) */
export function mayRevoke(user: CurrentUser | null, t: Target, role: Role): boolean {
  return can(user, "role.grant", ctx(t, role));
}

/** May `user` ban the target, or lift their ban? */
export function mayBan(user: CurrentUser | null, t: Target): boolean {
  return can(user, "user.ban", ctx(t));
}

/** The staff roles `user` may grant to the target, highest first. */
export function grantableRoles(user: CurrentUser | null, t: Target): StaffRole[] {
  return STAFF_ROLES.filter((r) => mayGrant(user, t, r));
}

/** Why `user` can't change the target at all, for the member page; null when they can. */
export function lockedReason(user: CurrentUser, t: Target): string | null {
  if (t.id === user.id) return "This is you. Nobody changes their own roles or bans themselves.";
  if (t.roles.includes("admin")) return "The owner's account can't be changed here.";
  if (t.roles.includes("superuser") && !can(user, "role.grant", ctx(t, "superuser"))) {
    return "Only the owner can change a superuser.";
  }
  return null;
}
