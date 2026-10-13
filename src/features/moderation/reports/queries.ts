import "server-only";
import { query } from "@/lib/db";
import type { ModerationAction, ReportStatus } from "@/db/types";
import { ACTIVE_BAN_SQL } from "@/features/admin/queries";
import { LOG_PER_PAGE, OPEN_REPORTS_MAX, RESOLVED_REPORTS, type TargetRef } from "./format";

/**
 * Reads for the report queue and the moderation log (/admin/reports, /admin/log) and the report
 * rate limit. Never cached: staff see the database as it is now, including hidden text, which
 * must never land in a shared cache. Results carry handles, never user ids.
 */

/** A reported or logged target with what /admin shows about it */
export type TargetInfo = TargetRef &
  (
    | {
        kind: "thread" | "reply";
        threadTitle: string;
        /** This post is hidden (the thread for frame 00, else the reply) */
        hidden: boolean;
        /** The thread is hidden (for a reply, its thread may be hidden too) */
        threadHidden: boolean;
        /** null for a deleted account */
        authorHandle: string | null;
        /** The start of the stored Markdown, shown as plain text */
        excerpt: string;
      }
    | { kind: "profile"; banned: boolean }
  );

const EXCERPT = 240;

// Joins every report (alias r) or log row (alias l, via `src`) to its target: the reply `rr`, the
// thread `t` (the reply's thread for a reply), its category `c`, the author `pa` and the reported
// member `pp`.
const targetJoins = (src: "r" | "l") => `
  left join app.replies rr on rr.id = ${src}.reply_id
  left join app.threads t on t.id = coalesce(${src}.thread_id, rr.thread_id)
  left join app.categories c on c.id = t.category_id
  left join app.profiles pa on pa.id = case when ${src}.reply_id is not null
                                            then rr.author_id else t.author_id end
  left join app.profiles pp on pp.id = ${src}.profile_id`;

const TARGET_COLUMNS = (src: "r" | "l") => `
  case when ${src}.reply_id is not null then 'reply'
       when ${src}.thread_id is not null then 'thread'
       when ${src}.profile_id is not null then 'profile' end as kind,
  t.id::text as "threadId", rr.id::text as "replyId", c.slug as "categorySlug",
  t.title as "threadTitle",
  case when ${src}.reply_id is not null then rr.hidden_at is not null
       else t.hidden_at is not null end as hidden,
  t.hidden_at is not null as "threadHidden",
  pa.handle::text as "authorHandle",
  left(coalesce(rr.body_md, t.body_md), ${EXCERPT}) as excerpt,
  pp.handle::text as "profileHandle",
  exists (select 1 from app.user_bans b where b.user_id = pp.id and ${ACTIVE_BAN_SQL}) as banned`;

interface TargetColumns {
  kind: "thread" | "reply" | "profile" | null;
  threadId: string | null;
  replyId: string | null;
  categorySlug: string | null;
  threadTitle: string | null;
  hidden: boolean;
  threadHidden: boolean;
  authorHandle: string | null;
  excerpt: string | null;
  profileHandle: string | null;
  banned: boolean;
}

/** The target of a row, or null once it's gone (a deleted post or account) */
function targetOf(r: TargetColumns): TargetInfo | null {
  if (r.kind === "profile") {
    return r.profileHandle ? { kind: "profile", handle: r.profileHandle, banned: r.banned } : null;
  }
  if (!r.kind || !r.threadId || !r.categorySlug) return null;
  const post = {
    threadId: r.threadId,
    categorySlug: r.categorySlug,
    threadTitle: r.threadTitle ?? "",
    hidden: r.hidden,
    threadHidden: r.threadHidden,
    authorHandle: r.authorHandle,
    excerpt: r.excerpt ?? "",
  };
  if (r.kind === "thread") return { kind: "thread", ...post };
  return r.replyId ? { kind: "reply", replyId: r.replyId, ...post } : null;
}

export interface QueuedReport {
  id: string;
  reason: string;
  createdAt: Date;
  /** null for a deleted account */
  reporterHandle: string | null;
}

/** One target's open reports, oldest first */
export interface ReportGroup {
  key: string;
  target: TargetInfo;
  reports: QueuedReport[];
}

function targetKey(t: TargetInfo): string {
  if (t.kind === "profile") return `profile:${t.handle.toLowerCase()}`;
  return t.kind === "reply" ? `reply:${t.replyId}` : `thread:${t.threadId}`;
}

/**
 * Open reports grouped by target, the target with the oldest open report first (at most
 * OPEN_REPORTS_MAX reports; the rest show once those are resolved). `total` counts them all.
 */
export async function listOpenReports(): Promise<{ groups: ReportGroup[]; total: number }> {
  const { rows } = await query<TargetColumns & QueuedReport & { total: number }>(
    `select r.id::text as id, r.reason, r.created_at as "createdAt",
            rp.handle::text as "reporterHandle", count(*) over ()::int as total,
            ${TARGET_COLUMNS("r")}
       from app.reports r
       left join app.profiles rp on rp.id = r.reporter_id
       ${targetJoins("r")}
      where r.status = 'open'
      order by r.created_at, r.id
      limit $1`,
    [OPEN_REPORTS_MAX],
  );
  const groups = new Map<string, ReportGroup>();
  for (const row of rows) {
    const target = targetOf(row);
    if (!target) continue;
    const key = targetKey(target);
    const report = {
      id: row.id,
      reason: row.reason,
      createdAt: row.createdAt,
      reporterHandle: row.reporterHandle,
    };
    const group = groups.get(key);
    if (group) group.reports.push(report);
    else groups.set(key, { key, target, reports: [report] });
  }
  return { groups: [...groups.values()], total: rows[0]?.total ?? 0 };
}

export interface ResolvedReport extends QueuedReport {
  status: Exclude<ReportStatus, "open">;
  resolvedAt: Date | null;
  /** null for a deleted account */
  resolverHandle: string | null;
  target: TargetInfo | null;
}

/** The most recently resolved reports (RESOLVED_REPORTS), newest first */
export async function listResolvedReports(): Promise<ResolvedReport[]> {
  const { rows } = await query<
    TargetColumns & QueuedReport & Pick<ResolvedReport, "status" | "resolvedAt" | "resolverHandle">
  >(
    `select r.id::text as id, r.reason, r.created_at as "createdAt", r.status::text as status,
            r.resolved_at as "resolvedAt", rp.handle::text as "reporterHandle",
            rv.handle::text as "resolverHandle", ${TARGET_COLUMNS("r")}
       from app.reports r
       left join app.profiles rp on rp.id = r.reporter_id
       left join app.profiles rv on rv.id = r.resolved_by
       ${targetJoins("r")}
      where r.status <> 'open'
      order by r.resolved_at desc nulls last, r.id desc
      limit $1`,
    [RESOLVED_REPORTS],
  );
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    createdAt: r.createdAt,
    reporterHandle: r.reporterHandle,
    status: r.status,
    resolvedAt: r.resolvedAt,
    resolverHandle: r.resolverHandle,
    target: targetOf(r),
  }));
}

export interface LogItem {
  id: string;
  action: ModerationAction;
  note: string | null;
  createdAt: Date;
  /** null for a deleted account */
  actorHandle: string | null;
  /** null when there is none (category changes) or it was deleted */
  target: TargetInfo | null;
}

export interface LogPage {
  items: LogItem[];
  total: number;
  page: number;
  pages: number;
}

/** One page of the moderation log, newest first (LOG_PER_PAGE to a page) */
export async function listModerationLog(page: number): Promise<LogPage> {
  const count = await query<{ total: number }>(
    "select count(*)::int as total from app.moderation_log",
  );
  const total = count.rows[0]!.total;
  const pages = Math.max(1, Math.ceil(total / LOG_PER_PAGE));
  const { rows } = await query<TargetColumns & Omit<LogItem, "target">>(
    `select l.id::text as id, l.action, l.note, l.created_at as "createdAt",
            a.handle::text as "actorHandle", ${TARGET_COLUMNS("l")}
       from app.moderation_log l
       left join app.profiles a on a.id = l.actor_id
       ${targetJoins("l")}
      order by l.created_at desc, l.id desc
      limit $1 offset $2`,
    [LOG_PER_PAGE, (page - 1) * LOG_PER_PAGE],
  );
  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    note: r.note,
    createdAt: r.createdAt,
    actorHandle: r.actorHandle,
    target: targetOf(r),
  }));
  return { items, total, page, pages };
}

/** Reports this member filed in the last `windowMs`, by the database's clock (limits.ts) */
export async function countRecentReports(reporterId: string, windowMs: number): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `select count(*)::int as n from app.reports
      where reporter_id = $1 and created_at > now() - $2::int * interval '1 millisecond'`,
    [reporterId, windowMs],
  );
  return rows[0]!.n;
}
