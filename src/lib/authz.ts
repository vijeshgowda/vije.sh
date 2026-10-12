/**
 * Every permission rule in one place (application.md section 8.7). Pure functions over a
 * CurrentUser, so the whole table is unit-tested. The server re-checks with can() inside every
 * Server Action and admin page; client islands may use it only to decide which controls to show.
 */
import type { Role } from "@/db/types";

export type { Role };

export interface RoleGrant {
  role: Role;
  /** null = global; otherwise a moderator for one category only */
  categoryId: string | null;
}

export interface CurrentUser {
  id: string;
  handle: string | null;
  onboarded: boolean;
  banned: boolean;
  roles: RoleGrant[];
}

/** Anything with role grants: a CurrentUser, or `{ roles: me.grants }` from /api/me. */
export type HasRoles = { roles: readonly RoleGrant[] };

export type Action =
  | "thread.create"
  | "reply.create"
  | "post.edit_own"
  | "report.create"
  | "post.hide"
  | "thread.lock"
  | "thread.pin"
  | "thread.move"
  | "report.review"
  | "user.ban"
  | "role.grant"
  | "admin.view"
  | "blog.write"
  | "category.manage";

export interface Ctx {
  categoryId?: string;
  authorId?: string | null;
  locked?: boolean;
  staffOnly?: boolean;
  /** For post.edit_own: when the post was created */
  createdAt?: Date;
  now?: Date;
  /** For user.ban and role.grant: the user acted on */
  targetId?: string;
  /** For user.ban and role.grant: the roles that user holds now ([] for a member) */
  targetRoles?: readonly Role[];
  /** For role.grant: the role being granted or revoked (one rule covers both) */
  grantRole?: Role;
}

export const EDIT_WINDOW_MS = 30 * 60 * 1000;

/** UI names for the stored roles; the `admin` row is the site owner. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Owner",
  superuser: "Superuser",
  moderator: "Moderator",
};

/** Highest first: owner, superuser, moderator. */
export const ROLE_ORDER: readonly Role[] = ["admin", "superuser", "moderator"];

/** The highest stored role among these (for a role pill), or null for a plain member. */
export function highestRole(roles: readonly (Role | RoleGrant)[]): Role | null {
  const names = new Set(roles.map((r) => (typeof r === "string" ? r : r.role)));
  return ROLE_ORDER.find((r) => names.has(r)) ?? null;
}

const has = (u: HasRoles, role: Role) => u.roles.some((r) => r.role === role);

/** The site owner (stored as `admin`). */
export const isOwner = (u: HasRoles) => has(u, "admin");
/** Superuser or owner: the staff who see /admin (notes and categories are the owner's only). */
export const isSuperuser = (u: HasRoles) => isOwner(u) || has(u, "superuser");
/** A moderator of every category (superusers and the owner aren't counted here). */
export const isGlobalModerator = (u: HasRoles) =>
  u.roles.some((r) => r.role === "moderator" && r.categoryId === null);
/** May moderate this category: superuser, owner, a global moderator or this category's moderator. */
export const moderates = (u: HasRoles, categoryId?: string) =>
  isSuperuser(u) ||
  isGlobalModerator(u) ||
  (categoryId !== undefined &&
    u.roles.some((r) => r.role === "moderator" && r.categoryId === categoryId));

/** Signed in, onboarded and not banned */
export const isMember = (u: CurrentUser | null): u is CurrentUser =>
  !!u && u.onboarded && !u.banned;

/**
 * Ban/unban and grant/revoke act on another user. Fails closed: the target's id and current roles
 * must be given, nobody acts on themselves, the owner is never a target and only the owner acts on
 * superusers.
 */
function canTarget(user: CurrentUser, ctx: Ctx): boolean {
  const roles = ctx.targetRoles;
  if (!ctx.targetId || !roles || ctx.targetId === user.id || roles.includes("admin")) return false;
  return isOwner(user) || (isSuperuser(user) && !roles.includes("superuser"));
}

export function can(user: CurrentUser | null, action: Action, ctx: Ctx = {}): boolean {
  if (!isMember(user)) return false;
  const owner = isOwner(user);
  const staff = moderates(user, ctx.categoryId);

  switch (action) {
    case "thread.create":
      return !ctx.staffOnly || staff;
    case "reply.create":
      return !ctx.locked || staff;
    case "post.edit_own": {
      if (owner) return true;
      if (!ctx.authorId || ctx.authorId !== user.id || !ctx.createdAt) return false;
      const now = (ctx.now ?? new Date()).getTime();
      return now - ctx.createdAt.getTime() <= EDIT_WINDOW_MS;
    }
    case "report.create":
      return true;
    case "post.hide":
    case "thread.lock":
    case "thread.pin":
    case "thread.move":
      return staff;
    case "admin.view":
    case "report.review":
      return isSuperuser(user);
    case "user.ban":
      return canTarget(user, ctx);
    case "role.grant":
      // superusers manage moderators; the owner also manages superusers; nobody grants owner
      return (
        (ctx.grantRole === "moderator" || (owner && ctx.grantRole === "superuser")) &&
        canTarget(user, ctx)
      );
    case "blog.write":
    case "category.manage":
      return owner;
  }
}
