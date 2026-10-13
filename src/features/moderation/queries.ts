import "server-only";
import { query } from "@/lib/db";
import type { PostKind } from "@/features/forum/schemas";

/**
 * Reads for moderation (actions.ts). Never cached: permissions are checked against the database
 * as it is now, and hidden text must never land in a shared cache.
 */

/** A thread or reply with what a permission check and a mutation need */
export interface ModerationTarget {
  kind: PostKind;
  id: string;
  threadId: string;
  /** The thread's category: the scope a moderator needs */
  categoryId: string;
  categorySlug: string;
  /** This post (the thread for frame 00, else the reply) is hidden */
  hidden: boolean;
  locked: boolean;
  pinned: boolean;
}

const TARGET_COLUMNS = `t.id::text as "threadId", c.id::text as "categoryId",
       c.slug as "categorySlug", t.locked_at is not null as locked,
       t.pinned_at is not null as pinned`;

export async function targetForModeration(
  kind: PostKind,
  id: string,
): Promise<ModerationTarget | null> {
  const sql =
    kind === "thread"
      ? `select 'thread' as kind, t.id::text as id, t.hidden_at is not null as hidden,
                ${TARGET_COLUMNS}
           from app.threads t join app.categories c on c.id = t.category_id
          where t.id = $1`
      : `select 'reply' as kind, r.id::text as id, r.hidden_at is not null as hidden,
                ${TARGET_COLUMNS}
           from app.replies r
           join app.threads t on t.id = r.thread_id
           join app.categories c on c.id = t.category_id
          where r.id = $1`;
  const { rows } = await query<ModerationTarget>(sql, [id]);
  return rows[0] ?? null;
}

/** The stored text of a hidden post, for a staff reveal. Raw Markdown, never rendered. */
export interface HiddenSource {
  /** The thread's title for frame 00, null for a reply */
  title: string | null;
  body: string;
  /** null once the account is deleted */
  authorHandle: string | null;
}

/** A hidden thread's or hidden reply's stored text; null when it's visible or gone. */
export async function hiddenSource(kind: PostKind, id: string): Promise<HiddenSource | null> {
  const sql =
    kind === "thread"
      ? `select t.title, t.body_md as body, p.handle::text as "authorHandle"
           from app.threads t left join app.profiles p on p.id = t.author_id
          where t.id = $1 and t.hidden_at is not null`
      : `select null as title, r.body_md as body, p.handle::text as "authorHandle"
           from app.replies r left join app.profiles p on p.id = r.author_id
          where r.id = $1 and r.hidden_at is not null`;
  const { rows } = await query<HiddenSource>(sql, [id]);
  return rows[0] ?? null;
}

/** A hidden thread, for the staff notice on its 404 page */
export interface HiddenThread {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  hiddenAt: Date;
}

export async function hiddenThread(id: string): Promise<HiddenThread | null> {
  const { rows } = await query<HiddenThread>(
    `select t.id::text as id, t.title, c.id::text as "categoryId", c.name as "categoryName",
            t.hidden_at as "hiddenAt"
       from app.threads t join app.categories c on c.id = t.category_id
      where t.id = $1 and t.hidden_at is not null`,
    [id],
  );
  return rows[0] ?? null;
}

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
}

/** Every category in display order (move destinations; actions.ts filters by scope) */
export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const { rows } = await query<CategoryOption>(
    "select id::text as id, slug, name from app.categories order by position, name",
  );
  return rows;
}

export async function categoryBySlug(slug: string): Promise<CategoryOption | null> {
  const { rows } = await query<CategoryOption>(
    "select id::text as id, slug, name from app.categories where slug = $1",
    [slug],
  );
  return rows[0] ?? null;
}
