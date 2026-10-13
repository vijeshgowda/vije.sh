import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { query } from "@/lib/db";
import type { RoleGrant } from "@/lib/authz";
import { THREADS_PER_LIST } from "./format";
import { displayRole } from "./roles";
import type { PostKind } from "./schemas";
import type { ForumCategory, Frame, ThreadDetail, ThreadSummary } from "./types";

/**
 * Public forum reads (application.md 7: `/forum` pages are cached for everyone). Every query is
 * tagged `forum`; lists also carry `category:<slug>` and a thread page `thread:<id>`, so writes
 * revalidate only what they touch:
 *
 * - new thread or reply, edit, hide, lock, pin: `thread:<id>` and `category:<slug>`
 * - move: `thread:<id>` and both categories
 * - category created, renamed, reordered, deleted: `forum`
 *
 * The latest-threads list on /forum is tagged with every category, so any of the above refreshes
 * it. `cacheLife("hours")` is a safety net in case a write misses a tag.
 *
 * Everyone reads every category. `staffOnly` (e.g. Announcements) only limits who starts threads
 * there (database.md): the new-thread picker hides those categories from members and the action
 * checks again.
 *
 * The write path's reads at the end of this file are not cached: permissions and rate limits must
 * see the database as it is now.
 */

export const FORUM_TAG = "forum";
export const categoryTag = (slug: string) => `category:${slug}`;
export const threadTag = (id: string) => `thread:${id}`;

type Grant = Pick<RoleGrant, "role" | "categoryId">;

/**
 * Whether the database answers. Forum pages prerender from it, but the site must still build
 * without one (unconfigured, paused or unreachable; see lib/env.ts). On failure the answer is
 * cached for seconds only, which turns the caller into a request-time hole during prerendering
 * instead of failing the build. At request time a false answer means the database is down.
 */
export async function databaseReady(): Promise<boolean> {
  "use cache";
  try {
    await query("select 1");
    cacheLife("hours");
    return true;
  } catch (err) {
    console.warn(`forum: database unavailable (${err instanceof Error ? err.message : err})`);
    cacheLife("seconds");
    return false;
  }
}

// An author's role grants as JSON: [{ role, categoryId }]
const GRANTS = (userColumn: string) =>
  `coalesce((select json_agg(json_build_object('role', ur.role, 'categoryId', ur.category_id::text))
               from app.user_roles ur where ur.user_id = ${userColumn}), '[]'::json)`;

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  staff_only: boolean;
}

const CATEGORY_SELECT = `select id::text as id, slug, name, description, staff_only
                           from app.categories`;

const toCategory = (r: CategoryRow): ForumCategory => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  staffOnly: r.staff_only,
});

/** Every category in display order */
export async function listCategories(): Promise<ForumCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG);
  const { rows } = await query<CategoryRow>(`${CATEGORY_SELECT} order by position, name`);
  return rows.map(toCategory);
}

/** A category by slug, or null */
export async function getCategory(slug: string): Promise<ForumCategory | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG, categoryTag(slug));
  const { rows } = await query<CategoryRow>(`${CATEGORY_SELECT} where slug = $1`, [slug]);
  const row = rows[0];
  return row ? toCategory(row) : null;
}

interface SummaryRow {
  id: string;
  title: string;
  category_slug: string;
  category_name: string;
  author_handle: string | null;
  reply_count: number;
  created_at: Date;
  last_activity_at: Date;
  pinned: boolean;
  locked: boolean;
}

const SUMMARY_SELECT = `
  select t.id::text as id, t.title, c.slug as category_slug, c.name as category_name,
         p.handle::text as author_handle, t.reply_count, t.created_at, t.last_activity_at,
         t.pinned_at is not null as pinned, t.locked_at is not null as locked
    from app.threads t
    join app.categories c on c.id = t.category_id
    left join app.profiles p on p.id = t.author_id
   where t.hidden_at is null`;

const toSummary = (r: SummaryRow): ThreadSummary => ({
  id: r.id,
  title: r.title,
  category: { slug: r.category_slug, name: r.category_name },
  authorHandle: r.author_handle,
  replyCount: r.reply_count,
  createdAt: r.created_at,
  lastActivityAt: r.last_activity_at,
  pinned: r.pinned,
  locked: r.locked,
});

/** The most recently active visible threads across every category (/forum) */
export async function listLatestThreads(): Promise<ThreadSummary[]> {
  "use cache";
  cacheLife("hours");
  const categories = await listCategories();
  cacheTag(FORUM_TAG, ...categories.map((c) => categoryTag(c.slug)));
  const { rows } = await query<SummaryRow>(
    `${SUMMARY_SELECT}
     order by t.last_activity_at desc, t.id desc
     limit $1`,
    [THREADS_PER_LIST],
  );
  return rows.map(toSummary);
}

/** Visible threads in one category: pinned first, then by latest activity */
export async function listCategoryThreads(slug: string): Promise<ThreadSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG, categoryTag(slug));
  const { rows } = await query<SummaryRow>(
    `${SUMMARY_SELECT} and c.slug = $1
     order by t.pinned_at desc nulls last, t.last_activity_at desc, t.id desc
     limit $2`,
    [slug, THREADS_PER_LIST],
  );
  return rows.map(toSummary);
}

interface ThreadRow {
  id: string;
  title: string;
  body_md: string;
  created_at: Date;
  edited_at: Date | null;
  pinned: boolean;
  locked: boolean;
  category_id: string;
  category_slug: string;
  category_name: string;
  category_description: string | null;
  category_staff_only: boolean;
  author_handle: string | null;
  author_exists: boolean;
  author_grants: Grant[];
}

interface ReplyRow {
  id: string;
  created_at: Date;
  edited_at: Date | null;
  hidden: boolean;
  body_md: string | null;
  author_handle: string | null;
  author_exists: boolean;
  author_grants: Grant[];
}

/**
 * A visible thread with all its frames, or null (missing or hidden). `id` must already be a valid id (parseThreadId). Hidden replies keep their
 * place as frames without author or body; the body never leaves the database here.
 */
export async function getThread(id: string): Promise<ThreadDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG, threadTag(id));
  const { rows } = await query<ThreadRow>(
    `select t.id::text as id, t.title, t.body_md, t.created_at, t.edited_at,
            t.pinned_at is not null as pinned, t.locked_at is not null as locked,
            c.id::text as category_id, c.slug as category_slug, c.name as category_name,
            c.description as category_description, c.staff_only as category_staff_only,
            p.handle::text as author_handle, p.id is not null as author_exists,
            ${GRANTS("p.id")} as author_grants
       from app.threads t
       join app.categories c on c.id = t.category_id
       left join app.profiles p on p.id = t.author_id
      where t.id = $1 and t.hidden_at is null`,
    [id],
  );
  const t = rows[0];
  if (!t) return null;

  const replies = await query<ReplyRow>(
    `select r.id::text as id, r.created_at, r.edited_at, r.hidden_at is not null as hidden,
            case when r.hidden_at is null then r.body_md end as body_md,
            case when r.hidden_at is null then p.handle::text end as author_handle,
            r.hidden_at is null and p.id is not null as author_exists,
            case when r.hidden_at is null then ${GRANTS("p.id")} else '[]'::json end as author_grants
       from app.replies r
       left join app.profiles p on p.id = r.author_id
      where r.thread_id = $1
      order by r.created_at, r.id`,
    [id],
  );

  const author = (exists: boolean, handle: string | null, grants: Grant[]) =>
    exists ? { handle, role: displayRole(grants, t.category_id) } : null;

  const frames: Frame[] = [
    {
      key: `thread-${t.id}`,
      kind: "thread",
      id: t.id,
      no: 0,
      createdAt: t.created_at,
      editedAt: t.edited_at,
      hidden: false,
      author: author(t.author_exists, t.author_handle, t.author_grants),
      bodyMd: t.body_md,
    },
    ...replies.rows.map((r, i): Frame => ({
      key: `reply-${r.id}`,
      kind: "reply",
      id: r.id,
      no: i + 1,
      createdAt: r.created_at,
      editedAt: r.hidden ? null : r.edited_at,
      hidden: r.hidden,
      author: author(r.author_exists, r.author_handle, r.author_grants),
      bodyMd: r.body_md,
    })),
  ];

  return {
    id: t.id,
    title: t.title,
    category: {
      id: t.category_id,
      slug: t.category_slug,
      name: t.category_name,
      description: t.category_description,
      staffOnly: t.category_staff_only,
    },
    createdAt: t.created_at,
    pinned: t.pinned,
    locked: t.locked,
    frames,
  };
}

/** Most threads listed in sitemap.xml, well under its 50,000-URL limit */
export const SITEMAP_THREADS = 40_000;

export interface SitemapThread {
  id: string;
  categorySlug: string;
  lastActivityAt: Date;
}

/** Visible threads for sitemap.xml, most recently active first */
export async function listSitemapThreads(): Promise<SitemapThread[]> {
  "use cache";
  cacheLife("hours");
  const categories = await listCategories();
  cacheTag(FORUM_TAG, ...categories.map((c) => categoryTag(c.slug)));
  const { rows } = await query<SitemapThread>(
    `select t.id::text as id, c.slug as "categorySlug", t.last_activity_at as "lastActivityAt"
       from app.threads t join app.categories c on c.id = t.category_id
      where t.hidden_at is null
      order by t.last_activity_at desc, t.id desc
      limit $1`,
    [SITEMAP_THREADS],
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The write path (actions.ts): uncached reads of what a permission check or rate limit needs.

/** A category a thread may be started in, as it is now */
export interface CategoryForPost {
  id: string;
  slug: string;
  name: string;
  staffOnly: boolean;
}

export async function categoryForPost(slug: string): Promise<CategoryForPost | null> {
  const { rows } = await query<CategoryForPost>(
    `select id::text as id, slug, name, staff_only as "staffOnly"
       from app.categories where slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** A visible thread that may take a reply, as it is now */
export interface ThreadForReply {
  id: string;
  categoryId: string;
  categorySlug: string;
  locked: boolean;
}

export async function threadForReply(id: string): Promise<ThreadForReply | null> {
  const { rows } = await query<ThreadForReply>(
    `select t.id::text as id, c.id::text as "categoryId", c.slug as "categorySlug",
            t.locked_at is not null as locked
       from app.threads t join app.categories c on c.id = t.category_id
      where t.id = $1 and t.hidden_at is null`,
    [id],
  );
  return rows[0] ?? null;
}

/** A visible post (in a visible thread) with what the edit rule and form need. Server only. */
export interface PostForEdit {
  kind: PostKind;
  id: string;
  threadId: string;
  categoryId: string;
  categorySlug: string;
  authorId: string | null;
  createdAt: Date;
  /** The thread's title; null for a reply */
  title: string | null;
  body: string;
}

export async function postForEdit(kind: PostKind, id: string): Promise<PostForEdit | null> {
  const sql =
    kind === "thread"
      ? `select 'thread' as kind, t.id::text as id, t.id::text as "threadId",
                c.id::text as "categoryId", c.slug as "categorySlug", t.author_id as "authorId",
                t.created_at as "createdAt", t.title, t.body_md as body
           from app.threads t join app.categories c on c.id = t.category_id
          where t.id = $1 and t.hidden_at is null`
      : `select 'reply' as kind, r.id::text as id, t.id::text as "threadId",
                c.id::text as "categoryId", c.slug as "categorySlug", r.author_id as "authorId",
                r.created_at as "createdAt", null as title, r.body_md as body
           from app.replies r
           join app.threads t on t.id = r.thread_id
           join app.categories c on c.id = t.category_id
          where r.id = $1 and r.hidden_at is null and t.hidden_at is null`;
  const { rows } = await query<PostForEdit>(sql, [id]);
  return rows[0] ?? null;
}

// Rate limits (limits.ts): rows by this author in the last `windowMs`, by the database's clock,
// hidden ones included.
const recent = (table: "threads" | "replies") =>
  `select count(*)::int as n from app.${table}
    where author_id = $1 and created_at > now() - $2::int * interval '1 millisecond'`;

export async function countRecentThreads(authorId: string, windowMs: number): Promise<number> {
  const { rows } = await query<{ n: number }>(recent("threads"), [authorId, windowMs]);
  return rows[0]!.n;
}

export async function countRecentReplies(authorId: string, windowMs: number): Promise<number> {
  const { rows } = await query<{ n: number }>(recent("replies"), [authorId, windowMs]);
  return rows[0]!.n;
}
