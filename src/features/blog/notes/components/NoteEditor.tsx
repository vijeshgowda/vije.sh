"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { Visibility } from "@/db/types";
import postStyles from "../../components/Post.module.css";
import {
  createNoteAction,
  previewNoteAction,
  updateNoteAction,
  type NoteField,
  type NoteFormState,
  type NotePreviewState,
} from "../actions";
import { NOTE_LIMITS, suggestNoteSlug, VISIBILITIES } from "../schemas";
import styles from "./NoteAdmin.module.css";

export interface EditableNote {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  bodyMd: string;
  tags: string[];
  visibility: Visibility;
}

const VISIBILITY_LABEL: Record<EditableNote["visibility"], string> = {
  public: "Public: listed on /blog",
  unlisted: "Unlisted: by URL only",
  private: "Private: only here",
};

/**
 * The owner's Markdown editor (application.md 9). Without `note` it creates a draft and opens it;
 * with one it saves in place. "Preview" renders the unsaved body on the server through the
 * sanitised pipeline; until then `savedPreview` (the stored body, rendered by the page) is shown.
 */
export function NoteEditor({
  note,
  savedPreview,
}: {
  note?: EditableNote;
  savedPreview?: ReactNode;
}) {
  const [state, save, saving] = useActionState<NoteFormState, FormData>(
    note ? updateNoteAction : createNoteAction,
    {},
  );
  const [preview, requestPreview, previewing] = useActionState<NotePreviewState, FormData>(
    previewNoteAction,
    {},
  );
  // Controlled, so a failed save keeps what was typed (React resets uncontrolled forms).
  const [title, setTitle] = useState(note?.title ?? "");
  const [slug, setSlug] = useState(note?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!note);
  const [summary, setSummary] = useState(note?.summary ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [visibility, setVisibility] = useState(note?.visibility ?? "public");
  const [bodyMd, setBodyMd] = useState(note?.bodyMd ?? "");

  const invalid = (f: NoteField) => (state.field === f ? true : undefined);
  const described = (f: NoteField, hint?: string) =>
    [hint, state.field === f ? "note-error" : undefined].filter(Boolean).join(" ") || undefined;

  // A requested preview is shown while it matches the text; after more typing, or a save, the
  // page's rendering of the stored body is the current one again.
  const fresh = preview.body !== undefined && preview.source === bodyMd;
  const shown = fresh ? preview.body : savedPreview;
  const busy = saving || previewing;

  return (
    <>
      <form action={save} className={styles.form} aria-label={note ? "Edit note" : "New note"}>
        {note && <input type="hidden" name="id" value={note.id} />}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note-title">
            Title
          </label>
          <input
            id="note-title"
            name="title"
            className={styles.input}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(suggestNoteSlug(e.target.value));
            }}
            required
            maxLength={NOTE_LIMITS.title}
            aria-invalid={invalid("title")}
            aria-describedby={described("title")}
          />
        </div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="note-slug">
              Slug
            </label>
            <input
              id="note-slug"
              name="slug"
              className={`${styles.input} ${styles.n}`}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
              required
              maxLength={NOTE_LIMITS.slug}
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={invalid("slug")}
              aria-describedby={described("slug", "note-slug-hint")}
            />
            <p id="note-slug-hint" className={styles.hint}>
              The URL: /blog/{slug || "\u2026"}. Changing it on a published note breaks old links.
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="note-visibility">
              Visibility
            </label>
            <select
              id="note-visibility"
              name="visibility"
              className={styles.input}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as EditableNote["visibility"])}
              aria-invalid={invalid("visibility")}
              aria-describedby={described("visibility")}
            >
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note-summary">
            Summary
          </label>
          <input
            id="note-summary"
            name="summary"
            className={styles.input}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={NOTE_LIMITS.summary}
            aria-invalid={invalid("summary")}
            aria-describedby={described("summary", "note-summary-hint")}
          />
          <p id="note-summary-hint" className={styles.hint}>
            Optional. Shown on /blog and as the abstract.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note-tags">
            Tags
          </label>
          <input
            id="note-tags"
            name="tags"
            className={styles.input}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-invalid={invalid("tags")}
            aria-describedby={described("tags", "note-tags-hint")}
          />
          <p id="note-tags-hint" className={styles.hint}>
            Comma-separated, up to {NOTE_LIMITS.tags}. The first is the category.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note-body">
            Body (Markdown)
          </label>
          <textarea
            id="note-body"
            name="bodyMd"
            className={`${styles.input} ${styles.body}`}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={18}
            maxLength={NOTE_LIMITS.body}
            spellCheck
            aria-invalid={invalid("bodyMd")}
            aria-describedby={described("bodyMd", "note-body-hint")}
          />
          <p id="note-body-hint" className={styles.hint}>
            GitHub-flavoured Markdown. Raw HTML is dropped.
          </p>
        </div>
        <div id="note-error" aria-live="polite">
          {state.error && <p className={styles.error}>{state.error}</p>}
        </div>
        <div className={styles.row}>
          <Button type="submit" variant="red" size="sm" disabled={busy}>
            {saving ? "Saving\u2026" : note ? "Save" : "Create draft"}
          </Button>
          <Button
            type="submit"
            size="sm"
            formAction={requestPreview}
            formNoValidate
            disabled={busy}
          >
            {previewing ? "Rendering\u2026" : "Preview"}
          </Button>
          <span className={styles.ok} role="status">
            {!saving && state.message}
          </span>
        </div>
      </form>

      <section className={styles.preview} aria-labelledby="note-preview-h">
        <header>
          <h2 id="note-preview-h">Preview</h2>
          <span>
            {fresh
              ? "Unsaved text, rendered as it will appear"
              : savedPreview
                ? "Saved version. Preview again to see unsaved changes."
                : "Press Preview to render the body."}
          </span>
        </header>
        {preview.error && (
          <p className={`${styles.error} ${styles.previewBody}`}>{preview.error}</p>
        )}
        <div className={`${postStyles.body} ${styles.previewBody}`} data-testid="note-preview">
          {shown}
        </div>
      </section>
    </>
  );
}
