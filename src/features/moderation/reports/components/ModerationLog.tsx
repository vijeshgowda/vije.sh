import Link from "next/link";
import { isoMinute } from "@/features/admin/format";
import { memberHref } from "@/features/admin/members";
import { profileHref } from "@/features/profile/format";
import { ACTION_LABEL, logHref, targetHref } from "../format";
import type { LogItem, LogPage } from "../queries";
import { LogUnhide } from "./LogUnhide";
import { targetName } from "./ReportQueue";
import a from "@/features/admin/components/Admin.module.css";

/**
 * /admin/log: every staff action, newest first, with who did it, the target (posts link to the
 * forum, members to their admin page) and the note. A thread that is still hidden can be unhidden
 * from its hide row.
 */
export function ModerationLog({ log }: { log: LogPage }) {
  const { items, total, page, pages } = log;
  if (items.length === 0) {
    return (
      <p className={a.locked} role="status">
        {total === 0 ? "Nothing logged yet." : "No entries on this page."}
      </p>
    );
  }
  return (
    <>
      <div className={a.tw} tabIndex={0} role="region" aria-label="Moderation log">
        <table className={`${a.tbl} ${a.wide}`}>
          <caption>
            {total === 1 ? "1 entry" : `${total.toLocaleString("en-GB")} entries`}, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Staff</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <LogRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <Pager page={page} pages={pages} />}
    </>
  );
}

function LogRow({ item }: { item: LogItem }) {
  const t = item.target;
  // still hidden: offer Unhide on its hide rows
  const hidden = item.action === "hide" && t?.kind === "thread" && t.hidden ? t : null;
  return (
    <tr>
      <td className={a.n}>
        <time dateTime={item.createdAt.toISOString()}>{isoMinute(item.createdAt)}</time>
      </td>
      <td>
        {item.actorHandle ? (
          <Link href={profileHref(item.actorHandle)} prefetch={false}>
            @{item.actorHandle}
          </Link>
        ) : (
          "[deleted]"
        )}
      </td>
      <td>{ACTION_LABEL[item.action]}</td>
      <td>
        {t ? (
          <Link href={t.kind === "profile" ? memberHref(t.handle) : targetHref(t)} prefetch={false}>
            {targetName(t)}
          </Link>
        ) : (
          "\u2014"
        )}
        {hidden && (
          <div className="mt-2">
            <LogUnhide threadId={hidden.threadId} title={hidden.threadTitle} />
          </div>
        )}
      </td>
      <td>{item.note ?? "\u2014"}</td>
    </tr>
  );
}

function Pager({ page, pages }: { page: number; pages: number }) {
  return (
    <nav className={a.pager} aria-label="Log pages">
      <span>
        Page {page} of {pages}
      </span>
      <ul>
        {page > 1 && (
          <li>
            <Link href={logHref(page - 1)} rel="prev">
              Newer
            </Link>
          </li>
        )}
        {page < pages && (
          <li>
            <Link href={logHref(page + 1)} rel="next">
              Older
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
