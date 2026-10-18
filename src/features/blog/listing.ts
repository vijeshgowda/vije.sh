import { newestFirst, noteId } from "./format";
import type { PublishedNote, PublishedNoteSummary } from "./notes/queries";
import type { NoteRow, Post } from "./posts";

/**
 * Git posts and database notes share one list and one AN numbering (application.md 9.4). The
 * design doesn't tell them apart, so a note becomes the same row and the same Post shape.
 */

/** Category of a note without tags. */
export const NOTE_CATEGORY = "Notes";

type Row = Omit<NoteRow, "id"> & { seq?: number };

const fromPost = (p: Post): Row => ({
  seq: p.seq,
  slug: p.slug,
  title: p.title,
  summary: p.summary,
  category: p.tags[0],
  date: p.date,
});

const fromNote = (n: PublishedNoteSummary): Row => ({
  slug: n.slug,
  title: n.title,
  summary: n.summary ?? "",
  category: n.tags[0] ?? NOTE_CATEGORY,
  date: n.date,
});

/**
 * Listed git posts and listed notes, newest first (same-day git posts by publish number), numbered together so the oldest is AN-001.
 * A note whose slug a git post has (`gitSlugs`: every git post, listed or not) is left out: the
 * git post owns the URL.
 */
export function mergeNoteRows(
  posts: Post[],
  notes: PublishedNoteSummary[],
  gitSlugs: ReadonlySet<string>,
): NoteRow[] {
  const rows = [
    ...posts.map(fromPost),
    ...notes.filter((n) => !gitSlugs.has(n.slug)).map(fromNote),
  ];
  rows.sort(newestFirst);
  return rows.map(({ seq: _seq, ...r }, i) => ({ id: noteId(i, rows.length), ...r }));
}

/** A published note in the shape the Post component renders. */
export function postFromNote(n: PublishedNote): Post {
  return {
    slug: n.slug,
    title: n.title,
    date: n.date,
    summary: n.summary ?? "",
    tags: n.tags.length > 0 ? n.tags : [NOTE_CATEGORY],
    visibility: n.visibility,
    draft: false,
    updated: n.updated > n.date ? n.updated : undefined,
    body: n.bodyMd,
  };
}

/**
 * Build check (application.md 9.4): a git post added with the slug of a published note would
 * silently hide the note, so the build fails instead. Rename one of them.
 */
export function assertNoSlugClash(gitSlugs: Iterable<string>, noteSlugs: string[]): void {
  const notes = new Set(noteSlugs);
  const clash = [...gitSlugs].filter((s) => notes.has(s));
  if (clash.length > 0) {
    throw new Error(
      `content/blog and published notes share the slug${clash.length > 1 ? "s" : ""} ${clash
        .map((s) => `"${s}"`)
        .join(", ")}: rename the git post folder or the note`,
    );
  }
}
