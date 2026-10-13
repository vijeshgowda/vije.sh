import "server-only";
import { query } from "@/lib/db";
import type { Role } from "@/db/types";
import { MEMBERS_PER_PAGE, type Target } from "./members";
import { containsPattern } from "./search";

/** /admin overview numbers. Uncached: read on every visit, "new" counted from now() in SQL. */
export interface AdminStats {
  members: number;
  onboarded: number;
  new7d: number;
  new30d: number;
  threads: number;
  replies: number;
  openReports: number;
  activeBans: number;
  notes: number;
  databaseBytes: number;
  categories: { slug: string; name: string; threads: number }[];
}

/**
 * SQL condition for an active ban row aliased `b`: not lifted and not run out (the same rule
 * loadCurrentUser applies). Shared with mutations.ts and later moderation code.
 */
export const ACTIVE_BAN_SQL = `b.lifted_at is null and (b.expires_at is null or b.expires_at > now())`;

export async function loadAdminStats(): Promise<AdminStats> {
  const { rows } = await query<{
    members: number;
    onboarded: number;
    new_7d: number;
    new_30d: number;
    threads: number;
    replies: number;
    open_reports: number;
    active_bans: number;
    notes: number;
    database_bytes: string;
  }>(
    `select (select count(*)::int from app.profiles) as members,
            (select count(*)::int from app.profiles where onboarded_at is not null) as onboarded,
            (select count(*)::int from app.profiles
              where created_at > now() - interval '7 days') as new_7d,
            (select count(*)::int from app.profiles
              where created_at > now() - interval '30 days') as new_30d,
            (select count(*)::int from app.threads) as threads,
            (select count(*)::int from app.replies) as replies,
            (select count(*)::int from app.reports where status = 'open') as open_reports,
            (select count(distinct b.user_id)::int from app.user_bans b where ${ACTIVE_BAN_SQL})
              as active_bans,
            (select count(*)::int from app.posts) as notes,
            pg_database_size(current_database())::text as database_bytes`,
  );
  const s = rows[0]!;
  const categories = await query<AdminStats["categories"][number]>(
    `select c.slug, c.name, count(t.id)::int as threads
       from app.categories c
       left join app.threads t on t.category_id = c.id
      group by c.id
      order by c.position, c.name`,
  );
  return {
    members: s.members,
    onboarded: s.onboarded,
    new7d: s.new_7d,
    new30d: s.new_30d,
    threads: s.threads,
    replies: s.replies,
    openReports: s.open_reports,
    activeBans: s.active_bans,
    notes: s.notes,
    databaseBytes: Number(s.database_bytes),
    categories: categories.rows,
  };
}

/** A role as listed for a member; `categoryName` is set for a moderator of one category. */
export interface MemberRole {
  role: Role;
  categoryId: string | null;
  categoryName: string | null;
}

export interface MemberListItem {
  handle: string | null;
  displayName: string | null;
  joinedAt: Date;
  onboarded: boolean;
  banned: boolean;
  roles: MemberRole[];
}

export interface MemberPage {
  members: MemberListItem[];
  total: number;
  page: number;
  pages: number;
}

// $1: ILIKE pattern (escaped by containsPattern), or null for everyone
const MEMBER_FILTER = `($1::text is null
   or p.handle::text ilike $1 escape '\\'
   or p.display_name ilike $1 escape '\\')`;

const ROLES_JSON = (userColumn: string) => `coalesce((
  select json_agg(json_build_object('role', r.role, 'categoryId', r.category_id::text,
                                    'categoryName', c.name)
                  order by r.role, c.position nulls first)
    from app.user_roles r left join app.categories c on c.id = r.category_id
   where r.user_id = ${userColumn}), '[]'::json)`;

/**
 * Members whose handle or display name contains `q` (any letter case; `%`, `_` and `\` match
 * themselves), newest first, MEMBERS_PER_PAGE to a page.
 */
export async function searchMembers(q: string, page: number): Promise<MemberPage> {
  const pattern = containsPattern(q);
  const count = await query<{ total: number }>(
    `select count(*)::int as total from app.profiles p where ${MEMBER_FILTER}`,
    [pattern],
  );
  const total = count.rows[0]!.total;
  const { rows } = await query<{
    handle: string | null;
    display_name: string | null;
    created_at: Date;
    onboarded: boolean;
    banned: boolean;
    roles: MemberRole[];
  }>(
    `select p.handle::text as handle, p.display_name, p.created_at,
            p.onboarded_at is not null as onboarded,
            exists (select 1 from app.user_bans b where b.user_id = p.id and ${ACTIVE_BAN_SQL}) as banned,
            ${ROLES_JSON("p.id")} as roles
       from app.profiles p
      where ${MEMBER_FILTER}
      order by p.created_at desc, p.id
      limit $2 offset $3`,
    [pattern, MEMBERS_PER_PAGE, (page - 1) * MEMBERS_PER_PAGE],
  );
  return {
    members: rows.map((r) => ({
      handle: r.handle,
      displayName: r.display_name,
      joinedAt: r.created_at,
      onboarded: r.onboarded,
      banned: r.banned,
      roles: r.roles,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / MEMBERS_PER_PAGE)),
  };
}

export interface MemberGrant extends MemberRole {
  grantedAt: Date;
  grantedBy: string | null;
}

export interface MemberBan {
  id: string;
  reason: string;
  bannedBy: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  liftedAt: Date | null;
  active: boolean;
}

export interface MemberDetail extends Target {
  handle: string;
  displayName: string | null;
  joinedAt: Date;
  onboarded: boolean;
  grants: MemberGrant[];
  /** Newest first, at most 20; `active` is decided in SQL */
  bans: MemberBan[];
}

/** One member by handle (any letter case) with roles and ban history, or null. */
export async function getMember(handle: string): Promise<MemberDetail | null> {
  const profile = await query<{
    id: string;
    handle: string;
    display_name: string | null;
    created_at: Date;
    onboarded: boolean;
  }>(
    `select p.id, p.handle::text as handle, p.display_name, p.created_at,
            p.onboarded_at is not null as onboarded
       from app.profiles p
      where p.handle operator(extensions.=) $1`,
    [handle],
  );
  const p = profile.rows[0];
  if (!p) return null;
  const grants = await query<{
    role: Role;
    category_id: string | null;
    category_name: string | null;
    granted_at: Date;
    granted_by: string | null;
  }>(
    `select r.role, r.category_id::text as category_id, c.name as category_name, r.granted_at,
            g.handle::text as granted_by
       from app.user_roles r
       left join app.categories c on c.id = r.category_id
       left join app.profiles g on g.id = r.granted_by
      where r.user_id = $1
      order by r.role, c.position nulls first`,
    [p.id],
  );
  const bans = await query<{
    id: string;
    reason: string;
    banned_by: string | null;
    created_at: Date;
    expires_at: Date | null;
    lifted_at: Date | null;
    active: boolean;
  }>(
    `select b.id::text as id, b.reason, g.handle::text as banned_by, b.created_at, b.expires_at,
            b.lifted_at, (${ACTIVE_BAN_SQL}) as active
       from app.user_bans b
       left join app.profiles g on g.id = b.banned_by
      where b.user_id = $1
      order by b.created_at desc, b.id desc
      limit 20`,
    [p.id],
  );
  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    joinedAt: p.created_at,
    onboarded: p.onboarded,
    roles: grants.rows.map((g) => g.role),
    grants: grants.rows.map((g) => ({
      role: g.role,
      categoryId: g.category_id,
      categoryName: g.category_name,
      grantedAt: g.granted_at,
      grantedBy: g.granted_by,
    })),
    bans: bans.rows.map((b) => ({
      id: b.id,
      reason: b.reason,
      bannedBy: b.banned_by,
      createdAt: b.created_at,
      expiresAt: b.expires_at,
      liftedAt: b.lifted_at,
      active: b.active,
    })),
  };
}

/** The member an admin action targets: id and current roles, by handle (any letter case). */
export async function getTarget(handle: string): Promise<Target | null> {
  const { rows } = await query<{ id: string; roles: Role[] }>(
    `select p.id,
            coalesce(array_agg(r.role::text) filter (where r.role is not null), '{}') as roles
       from app.profiles p
       left join app.user_roles r on r.user_id = p.id
      where p.handle operator(extensions.=) $1
      group by p.id`,
    [handle],
  );
  return rows[0] ?? null;
}

export interface CategoryOption {
  id: string;
  name: string;
}

/** Categories a moderator can be limited to, in forum order. */
export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const { rows } = await query<CategoryOption>(
    `select id::text as id, name from app.categories order by position, name`,
  );
  return rows;
}
