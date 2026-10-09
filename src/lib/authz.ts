/**
 * Every permission rule in one place (application.md section 8.7). Pure functions over a
 * CurrentUser, so the whole table is unit-tested. The server re-checks with can() inside every
 * Server Action; client islands may use it only to decide which controls to show.
 */

export type Role = "admin" | "moderator";

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
  | "blog.write"
  | "admin.manage";

export interface Ctx {
  categoryId?: string;
  authorId?: string | null;
  locked?: boolean;
  staffOnly?: boolean;
  /** For post.edit_own: when the post was created */
  createdAt?: Date;
  now?: Date;
}

export const EDIT_WINDOW_MS = 30 * 60 * 1000;

export const isAdmin = (u: CurrentUser) => u.roles.some((r) => r.role === "admin");
export const isGlobalModerator = (u: CurrentUser) =>
  u.roles.some((r) => r.role === "moderator" && r.categoryId === null);
export const moderates = (u: CurrentUser, categoryId?: string) =>
  isGlobalModerator(u) ||
  (categoryId !== undefined &&
    u.roles.some((r) => r.role === "moderator" && r.categoryId === categoryId));

/** Signed in, onboarded and not banned */
export const isMember = (u: CurrentUser | null): u is CurrentUser =>
  !!u && u.onboarded && !u.banned;

export function can(user: CurrentUser | null, action: Action, ctx: Ctx = {}): boolean {
  if (!isMember(user)) return false;
  if (isAdmin(user)) return true;
  const staff = moderates(user, ctx.categoryId);

  switch (action) {
    case "thread.create":
      return !ctx.staffOnly || staff;
    case "reply.create":
      return !ctx.locked || staff;
    case "post.edit_own": {
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
    case "report.review":
      return staff;
    case "user.ban":
      return isGlobalModerator(user);
    case "blog.write":
    case "admin.manage":
      return false;
  }
}
