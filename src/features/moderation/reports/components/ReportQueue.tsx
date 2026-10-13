import Link from "next/link";
import { Section } from "@/components/ui/Datasheet";
import { isoMinute } from "@/features/admin/format";
import { memberHref } from "@/features/admin/members";
import { plural } from "@/features/forum/format";
import { profileHref } from "@/features/profile/format";
import { targetHref } from "../format";
import type { ReportGroup, ResolvedReport, TargetInfo } from "../queries";
import { ReportActions } from "./ReportActions";
import a from "@/features/admin/components/Admin.module.css";
import s from "./Reports.module.css";

/**
 * /admin/reports: open reports grouped by target, the oldest waiting first, each with a link to
 * the target, its reports and the actions; then the latest resolved reports.
 */
export function ReportQueue({
  groups,
  total,
  resolved,
}: {
  groups: ReportGroup[];
  total: number;
  resolved: ResolvedReport[];
}) {
  const shown = groups.reduce((n, g) => n + g.reports.length, 0);
  return (
    <>
      <Section
        id="open"
        no={1}
        title="Open reports"
        note={total > shown ? `Oldest ${shown} of ${total}` : plural(total, "report", "reports")}
      >
        {groups.length === 0 ? (
          <p className={s.empty} role="status">
            No open reports.
          </p>
        ) : (
          <ol className={s.queue}>
            {groups.map((g) => (
              <QueuedTarget key={g.key} group={g} />
            ))}
          </ol>
        )}
      </Section>
      <Section id="resolved" no={2} title="Recently resolved">
        <ResolvedTable reports={resolved} />
      </Section>
    </>
  );
}

const KIND = { thread: "Thread", reply: "Reply", profile: "Profile" } as const;

/** "Thread title", "Reply in “Thread title”" or "@handle" */
export function targetName(t: TargetInfo): string {
  if (t.kind === "profile") return `@${t.handle}`;
  return t.kind === "thread" ? t.threadTitle : `Reply in \u201c${t.threadTitle}\u201d`;
}

function Handle({ handle }: { handle: string | null }) {
  return handle ? (
    <Link href={profileHref(handle)} className={s.handle}>
      @{handle}
    </Link>
  ) : (
    <>[deleted]</>
  );
}

function QueuedTarget({ group: { key, target, reports } }: { group: ReportGroup }) {
  const id = `q-${key.replace(/[^a-z0-9]/gi, "-")}`;
  const name = targetName(target);
  const post = target.kind !== "profile" && !target.hidden && !target.threadHidden;
  return (
    <li>
      <article aria-labelledby={id}>
        <header>
          <span className={s.kind}>{KIND[target.kind]}</span>
          {target.kind !== "profile" && <span>/{target.categorySlug}</span>}
          {target.kind !== "profile" && (target.hidden || target.threadHidden) && (
            <span className={s.flag}>{target.hidden ? "Hidden" : "Thread hidden"}</span>
          )}
          {target.kind === "profile" && target.banned && <span className={s.flag}>Banned</span>}
          <span className={s.count}>{plural(reports.length, "report", "reports")}</span>
        </header>
        <h3 id={id}>
          <Link href={targetHref(target)}>{name}</Link>
        </h3>
        {target.kind === "profile" ? (
          <p className={s.by}>
            <Link href={memberHref(target.handle)}>Member page</Link> (roles and bans)
          </p>
        ) : (
          <>
            <p className={s.by}>
              By <Handle handle={target.authorHandle} />
            </p>
            {target.excerpt && <p className={s.excerpt}>{target.excerpt}</p>}
          </>
        )}
        <ul className={s.reports} aria-label="Reports">
          {reports.map((r) => (
            <li key={r.id}>
              <span className={s.why}>{r.reason}</span>
              <span className={s.who}>
                #{r.id} by <Handle handle={r.reporterHandle} /> ·{" "}
                <time dateTime={r.createdAt.toISOString()}>{isoMinute(r.createdAt)}</time>
              </span>
            </li>
          ))}
        </ul>
        <ReportActions
          ids={reports.map((r) => r.id)}
          name={name}
          post={
            post
              ? {
                  kind: target.kind,
                  id: target.kind === "reply" ? target.replyId : target.threadId,
                }
              : undefined
          }
        />
      </article>
    </li>
  );
}

function ResolvedTable({ reports }: { reports: ResolvedReport[] }) {
  if (reports.length === 0) {
    return (
      <p className={s.empty} role="status">
        Nothing resolved yet.
      </p>
    );
  }
  return (
    <div className={a.tw} tabIndex={0} role="region" aria-label="Resolved reports">
      <table className={`${a.tbl} ${a.wide}`}>
        <caption>
          The latest {plural(reports.length, "resolved report", "resolved reports")}
        </caption>
        <thead>
          <tr>
            <th scope="col">Report</th>
            <th scope="col">Target</th>
            <th scope="col">Reason</th>
            <th scope="col">Status</th>
            <th scope="col">Resolved</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td className={a.n}>
                #{r.id}
                <br />
                <Handle handle={r.reporterHandle} />
              </td>
              <td>
                {r.target ? (
                  <Link href={targetHref(r.target)}>{targetName(r.target)}</Link>
                ) : (
                  "\u2014"
                )}
              </td>
              <td className={s.why}>{r.reason}</td>
              <td className={`${s.status} ${r.status === "actioned" ? s.actioned : ""}`}>
                {r.status === "actioned" ? "Actioned" : "Dismissed"}
              </td>
              <td className={a.n}>
                {r.resolvedAt ? (
                  <time dateTime={r.resolvedAt.toISOString()}>{isoMinute(r.resolvedAt)}</time>
                ) : (
                  "\u2014"
                )}
                <br />
                by <Handle handle={r.resolverHandle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
