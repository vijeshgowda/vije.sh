import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import f from "@/features/forum/components/Forum.module.css";
import { fmtDay, threadAddress } from "@/features/forum/format";
import { postHref } from "../format";
import type { ProfilePost } from "../types";
import s from "./Profile.module.css";

/**
 * A member's recent posts as the forum's thread rows (prototype `ol.threads`): the thread's bus
 * address, its title, and whether this was the opening post or a reply.
 */
export function PostList({ posts }: { posts: ProfilePost[] }) {
  if (posts.length === 0) return <p className={f.empty}>No posts yet.</p>;
  return (
    <Reveal as="ol" className={`${f.threads} ${s.posts}`}>
      {posts.map((p) => (
        <li key={`${p.kind}-${p.id}`}>
          <Link href={postHref(p)}>
            <span className={f.addr}>{threadAddress(p.threadId)}</span>
            <span className={f.tt}>
              <b>{p.kind === "reply" ? `Re: ${p.threadTitle}` : p.threadTitle}</b>
              <small>
                <span className={s.kind}>{p.kind === "reply" ? "Reply" : "Thread"}</span> &middot;{" "}
                {p.category.name} &middot;{" "}
                <time dateTime={p.createdAt.toISOString()}>{fmtDay(p.createdAt)}</time>
              </small>
            </span>
          </Link>
        </li>
      ))}
    </Reveal>
  );
}
