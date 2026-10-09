import Link from "next/link";
import type { Route } from "next";
import { fmtDate } from "../format";
import type { NoteRow } from "../posts";
import s from "./NoteList.module.css";

/** Application-notes list (prototype `noteRow`): id, title + summary, category, date. */
export function NoteList({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) return <p className={s.empty}>No application notes published yet.</p>;
  return (
    <ol className={s.an}>
      {notes.map((n) => (
        <li key={n.slug}>
          {/* /blog/[slug] lands with the blog index and post pages (docs/design.md) */}
          <Link href={`/blog/${encodeURIComponent(n.slug)}` as Route}>
            <span className={s.id}>{n.id}</span>
            <span className={s.t}>
              {n.title}
              <span className={s.ex}>{n.summary}</span>
            </span>
            <span className={s.c}>{n.category}</span>
            <time className={s.d} dateTime={n.date}>
              {fmtDate(n.date)}
            </time>
          </Link>
        </li>
      ))}
    </ol>
  );
}
