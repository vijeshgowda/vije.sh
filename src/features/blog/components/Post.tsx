import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { readMinutes } from "@/lib/markdown";
import { fmtDate } from "../format";
import type { NoteRow, PostEntry } from "../posts";
import { ReadProgress } from "./ReadProgress";
import s from "./Post.module.css";

const href = (n: NoteRow) => `/blog/${encodeURIComponent(n.slug)}` as Route;

/** One application note (prototype `pPost`): header table, abstract, body, older/newer pager. */
export function Post({ entry, children }: { entry: PostEntry; children: ReactNode }) {
  const { post, id, newer, older } = entry;
  return (
    <>
      <ReadProgress />
      <article className={s.post}>
        <Link className={s.back} href="/blog">
          &larr; All notes
        </Link>
        <p className={s.pn}>
          {id ? `Application note ${id}` : "Unlisted note"}
          {post.draft && <span className={s.draft}>Draft</span>}
        </p>
        <h1 tabIndex={-1}>{post.title}</h1>
        <dl className={s.anhead}>
          <div>
            <dt>Category</dt>
            <dd>{post.tags[0]}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>
              <time dateTime={post.date}>{fmtDate(post.date)}</time>
            </dd>
          </div>
          {post.updated && (
            <div>
              <dt>Updated</dt>
              <dd>
                <time dateTime={post.updated}>{fmtDate(post.updated)}</time>
              </dd>
            </div>
          )}
          <div>
            <dt>Read time</dt>
            <dd>{readMinutes(post.body)} min</dd>
          </div>
        </dl>
        <div className={s.abstract}>
          <p className={s.label}>Abstract</p>
          <p>{post.summary}</p>
        </div>
        <div className={s.body}>{children}</div>
        {(older || newer) && (
          <nav className={s.pager} aria-label="More notes">
            {older && (
              <Link href={href(older)}>
                <small>&larr; Older</small>
                {older.title}
              </Link>
            )}
            {newer && (
              <Link className={s.nx} href={href(newer)}>
                <small>Newer &rarr;</small>
                {newer.title}
              </Link>
            )}
          </nav>
        )}
      </article>
    </>
  );
}
