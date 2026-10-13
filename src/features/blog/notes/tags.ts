/**
 * Cache tags for notes (application.md 7). Every public read is tagged `notes`; reads of one note
 * also carry `note:<slug>`. After a write, revalidate `notes` plus the slug before and after the
 * change: `noteTags(slug, previousSlug)`.
 */
export const NOTES_TAG = "notes";

export const noteTag = (slug: string) => `note:${slug}`;

export function noteTags(...slugs: (string | null | undefined)[]): string[] {
  return [NOTES_TAG, ...new Set(slugs.filter((s): s is string => !!s).map(noteTag))];
}
