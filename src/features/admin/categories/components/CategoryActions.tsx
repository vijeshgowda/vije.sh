"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "@/components/layout/toast";
import { Button } from "@/components/ui/Button";
import {
  deleteCategoryAction,
  moveCategoryAction,
  setStaffOnlyAction,
  updateCategoryAction,
  type CategoryFormState,
  type CategoryRowState,
} from "../actions";
import type { AdminCategory } from "../queries";
import { CATEGORY_LIMITS } from "../schemas";
import styles from "./Categories.module.css";

type Action<S> = (prev: S, formData: FormData) => Promise<S>;

/** Announces a successful result as a toast, even when the row is gone by then (delete). */
function toasting<S extends { error?: string; message?: string }>(action: Action<S>): Action<S> {
  return async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error && result.message) toast(result.message);
    return result;
  };
}

/**
 * One category's controls: move up or down, the staff-only toggle, rename (dialog) and delete
 * (dialog; a category with threads only explains why it can't go). The server checks everything
 * again, so a stale table can't delete a category that has gained a thread.
 */
export function CategoryActions({
  category: c,
  nameId,
  index,
  first,
  last,
}: {
  category: AdminCategory;
  nameId: string;
  index: number;
  first: boolean;
  last: boolean;
}) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const upButton = useRef<HTMLButtonElement>(null);
  const downButton = useRef<HTMLButtonElement>(null);
  const moving = useRef<"up" | "down" | null>(null);

  const [moved, move, movePending] = useActionState<CategoryRowState, FormData>(
    toasting(moveCategoryAction),
    {},
  );
  const [toggled, toggle, togglePending] = useActionState<CategoryRowState, FormData>(
    toasting(setStaffOnlyAction),
    {},
  );
  const [saved, save, savePending] = useActionState<CategoryFormState, FormData>(
    toasting(updateCategoryAction),
    {},
  );
  // a successful save closes the dialog; each result is a new object
  useEffect(() => {
    if (saved.message && !saved.error) editDialog.current?.close();
  }, [saved]);
  const [removed, remove, removePending] = useActionState<CategoryRowState, FormData>(
    toasting(deleteCategoryAction),
    {},
  );

  // Controlled, so a failed save keeps what was typed; reset from the row each time it opens.
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description ?? "");

  // Keep focus on the arrow that moved the row (or its twin once the row reaches an end).
  useEffect(() => {
    const dir = moving.current;
    if (!dir) return;
    moving.current = null;
    const pressed = dir === "up" ? upButton.current : downButton.current;
    const other = dir === "up" ? downButton.current : upButton.current;
    (pressed && !pressed.disabled ? pressed : other)?.focus();
  }, [index]);

  const rowError = moved.error ?? toggled.error;
  const editId = `category-${c.id}-edit`;
  const deleteId = `category-${c.id}-delete`;
  const threads = `${c.threadCount} ${c.threadCount === 1 ? "thread" : "threads"}`;
  const grants =
    c.moderatorCount > 0
      ? ` and its ${c.moderatorCount} category moderator ${c.moderatorCount === 1 ? "grant" : "grants"}`
      : "";

  return (
    <div className={styles.actions}>
      <form action={move}>
        <input type="hidden" name="id" value={c.id} />
        <Button
          ref={upButton}
          type="submit"
          size="sm"
          name="direction"
          value="up"
          disabled={first || movePending}
          aria-describedby={nameId}
          onClick={() => (moving.current = "up")}
        >
          Up
        </Button>
        <Button
          ref={downButton}
          type="submit"
          size="sm"
          name="direction"
          value="down"
          disabled={last || movePending}
          aria-describedby={nameId}
          onClick={() => (moving.current = "down")}
        >
          Down
        </Button>
      </form>
      <form action={toggle}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="staffOnly" value={String(!c.staffOnly)} />
        <Button
          type="submit"
          size="sm"
          aria-pressed={c.staffOnly}
          aria-describedby={nameId}
          disabled={togglePending}
        >
          Staff only
        </Button>
      </form>
      <Button
        size="sm"
        aria-haspopup="dialog"
        aria-describedby={nameId}
        onClick={() => {
          setName(c.name);
          setDescription(c.description ?? "");
          editDialog.current?.showModal();
        }}
      >
        Edit
      </Button>
      <Button
        size="sm"
        aria-haspopup="dialog"
        aria-describedby={nameId}
        onClick={() => deleteDialog.current?.showModal()}
      >
        Delete
      </Button>
      {rowError && (
        <p className={styles.rowError} role="alert">
          {rowError}
        </p>
      )}

      <dialog ref={editDialog} className={styles.dialog} aria-labelledby={`${editId}-h`}>
        <form action={save}>
          <input type="hidden" name="id" value={c.id} />
          <h2 id={`${editId}-h`}>Edit {c.name}</h2>
          <label className={styles.label} htmlFor={`${editId}-name`}>
            Name
          </label>
          <input
            id={`${editId}-name`}
            name="name"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={CATEGORY_LIMITS.name}
            aria-invalid={saved.field === "name" || undefined}
            aria-describedby={saved.field === "name" ? `${editId}-error` : undefined}
          />
          <label className={styles.label} htmlFor={`${editId}-description`}>
            Description
          </label>
          <textarea
            id={`${editId}-description`}
            name="description"
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={CATEGORY_LIMITS.description}
            aria-invalid={saved.field === "description" || undefined}
            aria-describedby={
              [`${editId}-hint`, saved.field === "description" ? `${editId}-error` : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          <p id={`${editId}-hint`} className={styles.hint}>
            The slug /forum/{c.slug} stays: thread links keep working.
          </p>
          <div id={`${editId}-error`} aria-live="polite">
            {saved.error && <p className={styles.error}>{saved.error}</p>}
          </div>
          <div className={styles.row}>
            <Button type="submit" variant="red" size="sm" disabled={savePending}>
              {savePending ? "Saving\u2026" : "Save"}
            </Button>
            <Button size="sm" onClick={() => editDialog.current?.close()}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>

      <dialog ref={deleteDialog} className={styles.dialog} aria-labelledby={`${deleteId}-h`}>
        {c.threadCount > 0 ? (
          <div>
            <h2 id={`${deleteId}-h`}>{c.name} can&apos;t be deleted</h2>
            <p>
              It has {threads}, hidden ones included. Only empty categories can be deleted: move or
              delete its threads first.
            </p>
            <div className={styles.row}>
              <Button size="sm" onClick={() => deleteDialog.current?.close()}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form action={remove}>
            <input type="hidden" name="id" value={c.id} />
            <h2 id={`${deleteId}-h`}>Delete {c.name}?</h2>
            <p>
              /forum/{c.slug}
              {grants} will be removed for good. This can&apos;t be undone.
            </p>
            {removed.error && (
              <p className={styles.error} role="alert">
                {removed.error}
              </p>
            )}
            <div className={styles.row}>
              <Button type="submit" variant="red" size="sm" disabled={removePending}>
                {removePending ? "Deleting\u2026" : "Delete category"}
              </Button>
              <Button size="sm" onClick={() => deleteDialog.current?.close()}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
