import "server-only";
import { query, withTransaction } from "@/lib/db";
import { logModeration } from "../mutations";
import { resolveNote, type Resolution } from "./format";
import type { ReportTarget } from "./schemas";

/**
 * Report writes (actions.ts checks permissions first). Filing re-checks the target in the same
 * statement: it must still be visible (a post) or onboarded (a member) and not the reporter's own.
 */

/** ok; duplicate (this member already has an open report on it); own (their own post or profile); gone */
export type FileOutcome = "ok" | "duplicate" | "own" | "gone";

// Each target query returns the report's target columns and whether the reporter wrote it.
// $1 = reporter id, $2 = thread id, reply id or handle.
const TARGET_SQL: Record<ReportTarget["kind"], string> = {
  thread: `select t.id as thread_id, null::bigint as reply_id, null::uuid as profile_id,
                  t.author_id is not distinct from $1::uuid as own
             from app.threads t
            where t.id = $2::bigint and t.hidden_at is null`,
  reply: `select null::bigint as thread_id, r.id as reply_id, null::uuid as profile_id,
                 r.author_id is not distinct from $1::uuid as own
            from app.replies r join app.threads t on t.id = r.thread_id
           where r.id = $2::bigint and r.hidden_at is null and t.hidden_at is null`,
  profile: `select null::bigint as thread_id, null::bigint as reply_id, p.id as profile_id,
                   p.id = $1::uuid as own
              from app.profiles p
             where p.handle operator(extensions.=) $2 and p.onboarded_at is not null`,
};

export interface NewReport {
  reporterId: string;
  target: ReportTarget;
  /** The stored text (format.ts reportReason) */
  reason: string;
}

/**
 * Files a report. One open report per reporter and target: the table's unique
 * `reports_no_duplicates` (reporter, target) makes a repeat a conflict, which leaves an open
 * report alone ("duplicate") and reopens a resolved one with the new reason and time, since the
 * constraint allows one row per reporter and target in any status.
 */
export async function fileReport(r: NewReport): Promise<FileOutcome> {
  const ref = r.target.kind === "profile" ? r.target.handle : r.target.id;
  const { rows } = await query<{ found: boolean; own: boolean; id: string | null }>(
    `with target as (${TARGET_SQL[r.target.kind]}),
          filed as (
            insert into app.reports (reporter_id, thread_id, reply_id, profile_id, reason)
            select $1, thread_id, reply_id, profile_id, $3 from target where not own
            on conflict on constraint reports_no_duplicates do update
               set reason = excluded.reason, status = 'open', resolved_by = null,
                   resolved_at = null, created_at = now()
             where app.reports.status <> 'open'
            returning id)
     select exists (select 1 from target) as found,
            coalesce((select own from target), false) as own,
            (select id::text from filed) as id`,
    [r.reporterId, ref, r.reason],
  );
  const row = rows[0]!;
  if (!row.found) return "gone";
  if (row.own) return "own";
  return row.id ? "ok" : "duplicate";
}

export interface Resolve {
  ids: readonly string[];
  status: Resolution;
  actorId: string;
}

interface Resolved {
  id: string;
  threadId: string | null;
  replyId: string | null;
  profileId: string | null;
}

/**
 * Marks these reports actioned or dismissed (only those still open) and logs one
 * `report_resolve` row per target, naming the reports. Returns how many it resolved; 0 when
 * someone else resolved them first.
 */
export function resolveReports(r: Resolve): Promise<number> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<Resolved>(
      `update app.reports
          set status = $2, resolved_by = $3, resolved_at = now()
        where id = any($1::bigint[]) and status = 'open'
        returning id::text as id, thread_id::text as "threadId", reply_id::text as "replyId",
                  profile_id::text as "profileId"`,
      [r.ids, r.status, r.actorId],
    );
    const byTarget = new Map<string, Resolved[]>();
    for (const row of rows.sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)))) {
      const key = `${row.threadId}:${row.replyId}:${row.profileId}`;
      byTarget.set(key, [...(byTarget.get(key) ?? []), row]);
    }
    for (const group of byTarget.values()) {
      const { threadId, replyId, profileId } = group[0]!;
      await logModeration(c, {
        actorId: r.actorId,
        action: "report_resolve",
        threadId,
        replyId,
        profileId,
        note: resolveNote(
          r.status,
          group.map((g) => g.id),
        ),
      });
    }
    return rows.length;
  });
}
