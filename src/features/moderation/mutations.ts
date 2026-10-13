import "server-only";
import type * as pg from "pg";
import { withTransaction } from "@/lib/db";
import type { ModerationAction } from "@/db/types";
import type { PostKind } from "@/features/forum/schemas";

/**
 * Inline moderation writes (actions.ts checks permissions first). Each runs in one transaction with
 * its app.moderation_log row. The post is locked and its category read again under that lock, so a
 * thread moved to a category the moderator doesn't moderate since the check is refused ("stale").
 * Hiding or unhiding a reply fires the replies_counter trigger (reply_count) in the same transaction.
 */

/** ok; unchanged (already in that state, nothing logged); stale (gone or moved since the check) */
export type Outcome = "ok" | "unchanged" | "stale";

export interface LogEntry {
  actorId: string;
  action: ModerationAction;
  /** The thread acted on (hide/unhide of frame 00, lock, pin, move, a report on it) */
  threadId?: string | null;
  /** The reply acted on (hide/unhide); a reply row leaves threadId null */
  replyId?: string | null;
  /** The member acted on (ban, unban, role grant or revoke, a report on their profile) */
  profileId?: string | null;
  note?: string | null;
}

/**
 * Writes one moderation_log row on `client`, inside the change's own transaction. The one shared
 * helper for every staff change: inline moderation here, role and ban changes in
 * features/admin/mutations.ts, report resolutions in reports/mutations.ts.
 */
export async function logModeration(client: pg.PoolClient, e: LogEntry): Promise<void> {
  await client.query(
    `insert into app.moderation_log (actor_id, action, thread_id, reply_id, profile_id, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      e.actorId,
      e.action,
      e.threadId ?? null,
      e.replyId ?? null,
      e.profileId ?? null,
      e.note ?? null,
    ],
  );
}

interface Locked {
  categoryId: string;
  on: boolean;
}

/** Locks a thread row; `on` is the given flag column (an allow-listed name, never user input) */
async function lockThread(
  c: pg.PoolClient,
  id: string,
  flag: "hidden_at" | "locked_at" | "pinned_at",
): Promise<Locked | null> {
  const { rows } = await c.query<Locked>(
    `select category_id::text as "categoryId", ${flag} is not null as "on"
       from app.threads where id = $1 for update`,
    [id],
  );
  return rows[0] ?? null;
}

/** Locks a reply row (and holds its thread's category still) */
async function lockReply(c: pg.PoolClient, id: string): Promise<Locked | null> {
  const { rows } = await c.query<Locked>(
    `select t.category_id::text as "categoryId", r.hidden_at is not null as "on"
       from app.replies r join app.threads t on t.id = r.thread_id
      where r.id = $1
      for update of r for share of t`,
    [id],
  );
  return rows[0] ?? null;
}

export interface HideChange {
  kind: PostKind;
  id: string;
  /** The category the permission was checked for */
  categoryId: string;
  actorId: string;
  /** true hides, false unhides */
  hidden: boolean;
  note?: string | null;
}

/** Hides or unhides a thread (frame 00) or a reply; records who hid it (hidden_by). */
export function setHidden(h: HideChange): Promise<Outcome> {
  return withTransaction(async (c) => {
    const row =
      h.kind === "thread" ? await lockThread(c, h.id, "hidden_at") : await lockReply(c, h.id);
    if (!row || row.categoryId !== h.categoryId) return "stale";
    if (row.on === h.hidden) return "unchanged";
    const table = h.kind === "thread" ? "app.threads" : "app.replies";
    await c.query(
      `update ${table}
          set hidden_at = case when $2 then now() end,
              hidden_by = case when $2 then $3::uuid end
        where id = $1`,
      [h.id, h.hidden, h.actorId],
    );
    await logModeration(c, {
      actorId: h.actorId,
      action: h.hidden ? "hide" : "unhide",
      threadId: h.kind === "thread" ? h.id : null,
      replyId: h.kind === "reply" ? h.id : null,
      note: h.note,
    });
    return "ok";
  });
}

export interface FlagChange {
  threadId: string;
  categoryId: string;
  actorId: string;
  on: boolean;
}

const FLAGS = {
  lock: { column: "locked_at", on: "lock", off: "unlock" },
  pin: { column: "pinned_at", on: "pin", off: "unpin" },
} as const;

function setFlag(flag: keyof typeof FLAGS, f: FlagChange): Promise<Outcome> {
  const { column, on, off } = FLAGS[flag];
  return withTransaction(async (c) => {
    const row = await lockThread(c, f.threadId, column);
    if (!row || row.categoryId !== f.categoryId) return "stale";
    if (row.on === f.on) return "unchanged";
    await c.query(`update app.threads set ${column} = case when $2 then now() end where id = $1`, [
      f.threadId,
      f.on,
    ]);
    await logModeration(c, { actorId: f.actorId, action: f.on ? on : off, threadId: f.threadId });
    return "ok";
  });
}

/** Locks (members can't reply; staff still can) or unlocks a thread. */
export const setLocked = (f: FlagChange) => setFlag("lock", f);

/** Pins (first in its category's list) or unpins a thread. */
export const setPinned = (f: FlagChange) => setFlag("pin", f);

export interface MoveChange {
  threadId: string;
  from: { id: string; slug: string };
  to: { id: string; slug: string };
  actorId: string;
}

/** Moves a thread to another category. The log note reads "engineering -> general". */
export function moveThread(m: MoveChange): Promise<Outcome> {
  return withTransaction(async (c) => {
    const row = await lockThread(c, m.threadId, "hidden_at");
    if (!row || row.categoryId !== m.from.id) return "stale";
    if (m.from.id === m.to.id) return "unchanged";
    const dest = await c.query("select 1 from app.categories where id = $1 for share", [m.to.id]);
    if (dest.rowCount === 0) return "stale";
    await c.query("update app.threads set category_id = $2 where id = $1", [m.threadId, m.to.id]);
    await logModeration(c, {
      actorId: m.actorId,
      action: "move",
      threadId: m.threadId,
      note: `${m.from.slug} -> ${m.to.slug}`,
    });
    return "ok";
  });
}
