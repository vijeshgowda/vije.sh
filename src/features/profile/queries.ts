import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { query } from "@/lib/db";
import { highestRole, type Role } from "@/lib/authz";
import { categoryTag, FORUM_TAG, listCategories } from "@/features/forum/queries";
import { profileTag, RECENT_POSTS } from "./format";
import type { Profile, ProfilePost } from "./types";

interface ProfileRow {
  id: string;
  handle: string;
  joined_at: Date;
  roles: Role[];
  thread_count: number;
  reply_count: number;
}

interface PostRow {
  kind: "thread" | "reply";
  id: string;
  thread_id: string;
  thread_title: string;
  category_slug: string;
  category_name: string;
  created_at: Date;
}

/**
 * An onboarded member's public profile by handle (any casing), or null for an unknown handle, an
 * account that hasn't finished /welcome or a deleted one. Banned members keep their profile.
 *
 * Tags: `profile:<id>` (the forum actions refresh it when the member posts or edits), plus `forum`
 * and every `category:<slug>`, so role changes (which revalidate `forum`) and moderation (hide,
 * unhide, move, which revalidate the categories they touch) refresh it without knowing about
 * profiles. A miss is kept for minutes only, so a handle claimed later doesn't stay a 404.
 */
export async function getProfile(handle: string): Promise<Profile | null> {
  "use cache";
  const { rows } = await query<ProfileRow>(
    `select p.id, p.handle::text as handle, p.onboarded_at as joined_at,
            (select coalesce(json_agg(ur.role order by ur.role), '[]'::json)
               from app.user_roles ur
              where ur.user_id = p.id and ur.category_id is null) as roles,
            (select count(*)::int from app.threads t
              where t.author_id = p.id and t.hidden_at is null) as thread_count,
            (select count(*)::int from app.replies r join app.threads t on t.id = r.thread_id
              where r.author_id = p.id and r.hidden_at is null and t.hidden_at is null) as reply_count
       from app.profiles p
      where p.handle operator(extensions.=) $1 and p.onboarded_at is not null`,
    [handle],
  );
  const p = rows[0];
  if (!p) {
    cacheLife("minutes");
    cacheTag(FORUM_TAG);
    return null;
  }

  cacheLife("hours");
  const categories = await listCategories();
  cacheTag(profileTag(p.id), FORUM_TAG, ...categories.map((c) => categoryTag(c.slug)));

  const posts = await query<PostRow>(
    `select kind, id::text as id, thread_id::text as thread_id, thread_title,
            category_slug, category_name, created_at
       from (select 'thread' as kind, t.id, t.id as thread_id, t.title as thread_title,
                    c.slug as category_slug, c.name as category_name, t.created_at
               from app.threads t join app.categories c on c.id = t.category_id
              where t.author_id = $1 and t.hidden_at is null
             union all
             select 'reply', r.id, t.id, t.title, c.slug, c.name, r.created_at
               from app.replies r
               join app.threads t on t.id = r.thread_id
               join app.categories c on c.id = t.category_id
              where r.author_id = $1 and r.hidden_at is null and t.hidden_at is null) posts
      order by created_at desc, kind, id desc
      limit $2`,
    [p.id, RECENT_POSTS],
  );

  return {
    handle: p.handle,
    role: highestRole(p.roles) ?? "member",
    joinedAt: p.joined_at,
    threadCount: p.thread_count,
    replyCount: p.reply_count,
    posts: posts.rows.map((r): ProfilePost => ({
      kind: r.kind,
      id: r.id,
      threadId: r.thread_id,
      threadTitle: r.thread_title,
      category: { slug: r.category_slug, name: r.category_name },
      createdAt: r.created_at,
    })),
  };
}
