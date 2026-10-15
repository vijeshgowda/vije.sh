import { BackLink } from "@/components/ui/BackLink";
import { categoryHref, plural } from "../format";
import type { ThreadDetail } from "../types";
import { ThreadBadges } from "./ThreadBadges";
import s from "./Forum.module.css";

/** Thread page intro (prototype `pThread`): back link, category and frame count, title. */
export function ThreadIntro({ thread }: { thread: ThreadDetail }) {
  return (
    <div className={s.threadIntro}>
      <BackLink className="mt-8 mb-5" href={categoryHref(thread.category.slug)}>
        {thread.category.name}
      </BackLink>
      <p className={s.pn}>
        {thread.category.name} &middot; {plural(thread.frames.length, "frame", "frames")}
        <ThreadBadges pinned={thread.pinned} locked={thread.locked} />
      </p>
      <h1 className={s.title} tabIndex={-1}>
        {thread.title}
      </h1>
    </div>
  );
}
