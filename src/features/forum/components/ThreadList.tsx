import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { DELETED_AUTHOR, fmtDay, threadAddress, threadHref } from "../format";
import type { ThreadSummary } from "../types";
import { ThreadBadges } from "./ThreadBadges";
import s from "./Forum.module.css";

/**
 * Thread list (prototype `ol.threads`): bus address, title with category, author and last
 * activity, Pinned/Locked badges and the reply-count square.
 */
export function ThreadList({
  threads,
  empty = "No threads yet.",
}: {
  threads: ThreadSummary[];
  empty?: string;
}) {
  if (threads.length === 0) return <p className={s.empty}>{empty}</p>;
  return (
    <Reveal as="ol" className={s.threads}>
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={threadHref(t.category.slug, t.id)}>
            <span className={s.addr}>{threadAddress(t.id)}</span>
            <span className={s.tt}>
              <b>{t.title}</b>
              <small>
                {t.category.name} &middot; {t.authorHandle ?? DELETED_AUTHOR} &middot;{" "}
                <time dateTime={t.lastActivityAt.toISOString()}>{fmtDay(t.lastActivityAt)}</time>
              </small>
            </span>
            <ThreadBadges pinned={t.pinned} locked={t.locked} />
            <span className={s.rc} title="Replies">
              {t.replyCount}
              <span className="sr-only">{t.replyCount === 1 ? " reply" : " replies"}</span>
            </span>
          </Link>
        </li>
      ))}
    </Reveal>
  );
}
