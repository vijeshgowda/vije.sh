"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { PostStatus, Visibility } from "@/db/types";
import {
  deleteNoteAction,
  publishNoteAction,
  unpublishNoteAction,
  type NoteStatusState,
} from "../actions";
import styles from "./NoteAdmin.module.css";

/**
 * Status and danger controls for one note: publish or unpublish, a link to the live page, and
 * delete behind a confirmation dialog (prototype dialog).
 */
export function NoteControls({
  id,
  title,
  slug,
  status,
  visibility,
}: {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  visibility: Visibility;
}) {
  const published = status === "published";
  const [toggled, toggle, toggling] = useActionState<NoteStatusState, FormData>(
    published ? unpublishNoteAction : publishNoteAction,
    {},
  );
  const [removed, remove, removing] = useActionState<NoteStatusState, FormData>(
    deleteNoteAction,
    {},
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const error = toggled.error ?? removed.error;

  return (
    <div className={styles.controls}>
      <span className={styles.status} data-status={status}>
        {published ? "Published" : "Draft"}
      </span>
      <form action={toggle}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant={published ? "default" : "red"} disabled={toggling}>
          {published ? "Unpublish" : "Publish"}
        </Button>
      </form>
      {published && visibility !== "private" && (
        <Link className={styles.link} href={`/blog/${slug}` as Route}>
          View /blog/{slug}
        </Link>
      )}
      <span className={styles.ok} role="status">
        {!toggling && toggled.message}
      </span>
      <Button
        size="sm"
        className={styles.push}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Delete
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="note-delete-h">
        <form action={remove}>
          <input type="hidden" name="id" value={id} />
          <h2 id="note-delete-h">Delete this note?</h2>
          <p>
            &ldquo;{title}&rdquo; will be removed for good
            {published ? " and disappear from /blog" : ""}. This can&apos;t be undone.
          </p>
          <div className={styles.row}>
            <Button type="submit" variant="red" size="sm" disabled={removing}>
              {removing ? "Deleting\u2026" : "Delete note"}
            </Button>
            <Button size="sm" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
