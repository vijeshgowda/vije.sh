import "server-only";
import type * as pg from "pg";
import { withTransaction } from "@/lib/db";
import type { ModerationAction, Role } from "@/db/types";
import type { StaffRole } from "./members";
import { ACTIVE_BAN_SQL } from "./queries";

/**
 * Role and ban changes from /admin/members. Each runs in one transaction with its
 * app.moderation_log row(s). The target's profile row is locked first and `allowed` is asked again
 * with the roles read under that lock, so a concurrent grant can't slip past the action's can().
 */

/** ok; forbidden (the re-check failed); unchanged (nothing to do); invalid (no such category) */
export type MutationResult = "ok" | "forbidden" | "unchanged" | "invalid";

/** Re-checks permission with the target's current roles. */
export type TargetCheck = (targetRoles: Role[]) => boolean;

export interface LogEntry {
  actorId: string;
  action: ModerationAction;
  profileId?: string | null;
  threadId?: string | null;
  replyId?: string | null;
  note?: string | null;
}

/** Writes one moderation_log row on `client` (call it inside the change's own transaction). */
export async function logModeration(client: pg.PoolClient, e: LogEntry): Promise<void> {
  await client.query(
    `insert into app.moderation_log (actor_id, action, profile_id, thread_id, reply_id, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      e.actorId,
      e.action,
      e.profileId ?? null,
      e.threadId ?? null,
      e.replyId ?? null,
      e.note ?? null,
    ],
  );
}

/** Locks the target's profile row and returns their roles, or null when the profile is gone. */
export async function lockTarget(client: pg.PoolClient, userId: string): Promise<Role[] | null> {
  const p = await client.query("select 1 from app.profiles where id = $1 for update", [userId]);
  if (p.rowCount === 0) return null;
  const { rows } = await client.query<{ role: Role }>(
    "select role::text as role from app.user_roles where user_id = $1",
    [userId],
  );
  return rows.map((r) => r.role);
}

/** Runs `fn` in a transaction under the target's lock, after `allowed` agrees with their roles now. */
export function guarded(
  targetId: string,
  allowed: TargetCheck,
  fn: (client: pg.PoolClient, roles: Role[]) => Promise<MutationResult>,
): Promise<MutationResult> {
  return withTransaction(async (client) => {
    const roles = await lockTarget(client, targetId);
    if (!roles || !allowed(roles)) return "forbidden";
    return fn(client, roles);
  });
}

export interface RoleChange {
  actorId: string;
  targetId: string;
  role: StaffRole;
  /** A moderator's category; null = global (always null for a superuser) */
  categoryId: string | null;
}

/** "superuser", "moderator" or "moderator in engineering": the log note for a role change. */
const roleNote = (role: Role, categorySlug: string | null) =>
  categorySlug ? `${role} in ${categorySlug}` : role;

async function categorySlug(client: pg.PoolClient, id: string): Promise<string | null> {
  const { rows } = await client.query<{ slug: string }>(
    "select slug from app.categories where id = $1",
    [id],
  );
  return rows[0]?.slug ?? null;
}

/**
 * Grants a staff role. Granting superuser also removes the user's moderator grants (a superuser
 * moderates everywhere), each logged as a revoke.
 */
export function grantRole(c: RoleChange, allowed: TargetCheck): Promise<MutationResult> {
  return guarded(c.targetId, allowed, async (client) => {
    let slug: string | null = null;
    if (c.categoryId !== null) {
      slug = await categorySlug(client, c.categoryId);
      if (!slug) return "invalid";
    }
    const inserted = await client.query(
      `insert into app.user_roles (user_id, role, category_id, granted_by)
       values ($1, $2, $3, $4)
       on conflict on constraint user_roles_unique do nothing`,
      [c.targetId, c.role, c.categoryId, c.actorId],
    );
    if (inserted.rowCount === 0) return "unchanged";
    await logModeration(client, {
      actorId: c.actorId,
      action: "role_grant",
      profileId: c.targetId,
      note: roleNote(c.role, slug),
    });
    if (c.role === "superuser") {
      const removed = await client.query<{ slug: string | null }>(
        `with removed as (
           delete from app.user_roles where user_id = $1 and role = 'moderator'
           returning category_id)
         select c.slug from removed r left join app.categories c on c.id = r.category_id
          order by c.position nulls first`,
        [c.targetId],
      );
      for (const r of removed.rows) {
        await logModeration(client, {
          actorId: c.actorId,
          action: "role_revoke",
          profileId: c.targetId,
          note: `${roleNote("moderator", r.slug)} (now a superuser)`,
        });
      }
    }
    return "ok";
  });
}

/** Revokes one staff role grant (a moderator's category must match). */
export function revokeRole(c: RoleChange, allowed: TargetCheck): Promise<MutationResult> {
  return guarded(c.targetId, allowed, async (client) => {
    const removed = await client.query<{ slug: string | null }>(
      `delete from app.user_roles r
        where r.user_id = $1 and r.role = $2 and r.category_id is not distinct from $3
       returning (select slug from app.categories where id = r.category_id) as slug`,
      [c.targetId, c.role, c.categoryId],
    );
    if (removed.rowCount === 0) return "unchanged";
    await logModeration(client, {
      actorId: c.actorId,
      action: "role_revoke",
      profileId: c.targetId,
      note: roleNote(c.role, removed.rows[0]!.slug),
    });
    return "ok";
  });
}

export interface BanChange {
  actorId: string;
  targetId: string;
  reason: string;
  /** Length in days; null = permanent. The expiry is now() + days, computed in SQL. */
  days: number | null;
}

/**
 * Inserts a ban and its log row on `client` unless the user already has an active ban. For use
 * inside a caller's transaction (banUser here; a report action later). Returns whether it banned.
 */
export async function insertBan(client: pg.PoolClient, b: BanChange): Promise<boolean> {
  const inserted = await client.query(
    `insert into app.user_bans (user_id, reason, banned_by, expires_at)
     select $1, $2, $3, now() + make_interval(days => $4::int)
      where not exists (select 1 from app.user_bans b where b.user_id = $1 and ${ACTIVE_BAN_SQL})`,
    [b.targetId, b.reason, b.actorId, b.days],
  );
  if (inserted.rowCount === 0) return false;
  await logModeration(client, {
    actorId: b.actorId,
    action: "ban",
    profileId: b.targetId,
    note: b.days === null ? b.reason : `${b.reason} (${b.days} d)`,
  });
  return true;
}

/** Lifts the user's active ban(s) on `client` and logs one `unban`. Returns whether any was active. */
export async function liftActiveBans(
  client: pg.PoolClient,
  u: { actorId: string; targetId: string },
): Promise<boolean> {
  const lifted = await client.query(
    `update app.user_bans b set lifted_at = now() where b.user_id = $1 and ${ACTIVE_BAN_SQL}`,
    [u.targetId],
  );
  if (lifted.rowCount === 0) return false;
  await logModeration(client, { actorId: u.actorId, action: "unban", profileId: u.targetId });
  return true;
}

/**
 * Bans the user unless a ban is already active. Takes effect on their next request: the session
 * reads bans on every request and no cached page shows ban state, so nothing is revalidated.
 */
export function banUser(b: BanChange, allowed: TargetCheck): Promise<MutationResult> {
  return guarded(b.targetId, allowed, async (client) =>
    (await insertBan(client, b)) ? "ok" : "unchanged",
  );
}

/** Lifts the user's active ban(s) early. */
export function liftBan(
  u: { actorId: string; targetId: string },
  allowed: TargetCheck,
): Promise<MutationResult> {
  return guarded(u.targetId, allowed, async (client) =>
    (await liftActiveBans(client, u)) ? "ok" : "unchanged",
  );
}
