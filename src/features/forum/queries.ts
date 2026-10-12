import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { query } from "@/lib/db";
import type { RoleGrant } from "@/lib/authz";
import { THREADS_PER_LIST } from "./format";
import { displayRole } from "./roles";
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
 * Staff-only categories are left out of every public read for now; staff visibility comes with
 * the write path.
 */

export const FORUM_TAG = "forum";
export const categoryTag = (slug: string) => `category:${slug}`;
export const threadTag = (id: string) => `thread:${id}`;

type Grant = Pick<RoleGrant, "role" | "categoryId">;

// An author's role grants as JSON: [{ role, categoryId }]
const GRANTS = (userColumn: string) =>
  `coalesce((select json_agg(json_build_object('role', ur.role, 'categoryId', ur.category_id::text))
               from app.user_roles ur where ur.user_id = ${userColumn}), '[]'::json)`;

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

/** Public categories in display order */
export async function listCategories(): Promise<ForumCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG);
  const { rows } = await query<CategoryRow>(
    `select id::text as id, slug, name, description
       from app.categories
      where not staff_only
      order by position, name`,
  );
  return rows.map((r) => ({ ...r }));
}

/** A public category by slug, or null */
export async function getCategory(slug: string): Promise<ForumCategory | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(FORUM_TAG, categoryTag(slug));
  const { rows } = await query<CategoryRow>(
    `select id::text as id, slug, name, description
       from app.categories
      where slug = $1 and not staff_only`,
    [slug],
  );
  const row = rows[0];
  return row ? { ...row } : null;
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
   where t.hidden_at is null and not c.staff_only`;

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

/** The most recently active visible threads across public categories (/forum) */
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

/** Visible threads in one public category: pinned first, then by latest activity */
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
 * A visible thread in a public category with all its frames, or null (missing, hidden, or in a
 * staff-only category). `id` must already be a valid id (parseThreadId). Hidden replies keep their
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
            c.description as category_description,
            p.handle::text as author_handle, p.id is not null as author_exists,
            ${GRANTS("p.id")} as author_grants
       from app.threads t
       join app.categories c on c.id = t.category_id
       left join app.profiles p on p.id = t.author_id
      where t.id = $1 and t.hidden_at is null and not c.staff_only`,
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
    },
    createdAt: t.created_at,
    pinned: t.pinned,
    locked: t.locked,
    frames,
  };
}
