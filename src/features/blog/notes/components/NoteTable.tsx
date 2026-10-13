import type { Route } from "next";
import Link from "next/link";
import { NOTE_TIME_ZONE, type AdminNoteListItem } from "../queries";
import styles from "./NoteAdmin.module.css";

const stamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: NOTE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function When({ at }: { at: Date | null }) {
  if (!at) return <>&mdash;</>;
  return <time dateTime={at.toISOString()}>{stamp.format(at)}</time>;
}

/** Every note for the owner (prototype .tw/.tbl): drafts and published, newest edit first. */
export function NoteTable({ notes }: { notes: AdminNoteListItem[] }) {
  return (
    // scrolls sideways on narrow screens, so it must be focusable for keyboard users
    <div className={styles.tw} tabIndex={0} role="region" aria-label="Notes table">
      <table className={styles.tbl}>
        <caption className="sr-only">Notes, most recently edited first</caption>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">Visibility</th>
            <th scope="col">Published</th>
            <th scope="col">Edited</th>
          </tr>
        </thead>
        <tbody>
          {notes.length === 0 && (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No notes yet. Git posts live in content/blog.
              </td>
            </tr>
          )}
          {notes.map((n) => (
            <tr key={n.id}>
              <td>
                <Link href={`/admin/notes/${n.id}` as Route}>{n.title}</Link>
                <br />
                <span className={`${styles.n} ${styles.hint}`}>/blog/{n.slug}</span>
              </td>
              <td>
                <span className={styles.status} data-status={n.status}>
                  {n.status === "published" ? "Published" : "Draft"}
                </span>
              </td>
              <td className={styles.n}>{n.visibility}</td>
              <td className={styles.n}>
                <When at={n.published_at} />
              </td>
              <td className={styles.n}>
                <When at={n.updated_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
