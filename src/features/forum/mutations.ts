import "server-only";
import { query } from "@/lib/db";

/**
 * Forum writes (actions.ts checks permissions and limits first). Each is one statement, so the
 * replies_counter trigger (reply_count, last_activity_at) runs in the same transaction. The rules
 * that could change between the check and the write are repeated in SQL: a category that turned
 * staff-only, a thread that was locked or hidden meanwhile. Those return null or false.
 */

/** Starts a thread; null when the category is gone or turned staff-only for a non-staff author. */
export async function insertThread(t: {
  categoryId: string;
  authorId: string;
  title: string;
  body: string;
  /** The author may post in staff-only categories */
  staff: boolean;
}): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     select c.id, $2, $3, $4 from app.categories c
      where c.id = $1 and (not c.staff_only or $5)
     returning id::text as id`,
    [t.categoryId, t.authorId, t.title, t.body, t.staff],
  );
  return rows[0]?.id ?? null;
}

/** Adds a reply; null when the thread is hidden or gone, or locked and the author isn't staff. */
export async function insertReply(r: {
  threadId: string;
  authorId: string;
  body: string;
  /** The author may reply in locked threads */
  staff: boolean;
}): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md)
     select t.id, $2, $3 from app.threads t
      where t.id = $1 and t.hidden_at is null and (t.locked_at is null or $4)
     returning id::text as id`,
    [r.threadId, r.authorId, r.body, r.staff],
  );
  return rows[0]?.id ?? null;
}

/** Edits a visible thread's title and opening post; false when it's hidden or gone. */
export async function updateThread(t: { id: string; title: string; body: string }) {
  const { rowCount } = await query(
    `update app.threads set title = $2, body_md = $3, edited_at = now()
      where id = $1 and hidden_at is null`,
    [t.id, t.title, t.body],
  );
  return rowCount === 1;
}

/** Edits a visible reply in a visible thread; false when either is hidden or gone. */
export async function updateReply(r: { id: string; body: string }) {
  const { rowCount } = await query(
    `update app.replies r set body_md = $2, edited_at = now()
       from app.threads t
      where r.id = $1 and t.id = r.thread_id and r.hidden_at is null and t.hidden_at is null`,
    [r.id, r.body],
  );
  return rowCount === 1;
}
