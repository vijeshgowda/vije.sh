import "server-only";
import { assertNoSlugClash, mergeNoteRows, postFromNote } from "../listing";
import {
  getPublishedNote,
  listPublishedNoteSlugs,
  listPublishedNotes,
  type PublishedNote,
} from "../notes/queries";
import {
  CONTENT_DIR,
  entryFor,
  listedPosts,
  readPosts,
  showDrafts,
  type NoteRow,
  type PostEntry,
} from "../posts";

/**
 * The blog as visitors see it: git posts (read at build) merged with published notes (cached
 * database reads tagged `notes`). Pages that list or open posts use these, never the two sources
 * separately, so numbering and neighbours agree everywhere.
 */

export type BlogEntry =
  { source: "git"; entry: PostEntry } | { source: "note"; entry: PostEntry; note: PublishedNote };

async function rowsFor(dir: string) {
  const drafts = showDrafts();
  const posts = readPosts(dir);
  const gitSlugs = new Set(posts.map((p) => p.slug));
  const rows = mergeNoteRows(listedPosts(posts, { drafts }), await listPublishedNotes(), gitSlugs);
  return { drafts, posts, rows };
}

/** Every listed post and note, newest first (/blog, sitemap, palette). */
export async function blogNoteRows(dir = CONTENT_DIR): Promise<NoteRow[]> {
  return (await rowsFor(dir)).rows;
}

export async function latestBlogNotes(count: number, dir = CONTENT_DIR): Promise<NoteRow[]> {
  return (await blogNoteRows(dir)).slice(0, count);
}

/** The git post or published note at /blog/<slug>; a git post always wins the slug. */
export async function getBlogEntry(slug: string, dir = CONTENT_DIR): Promise<BlogEntry | null> {
  const { drafts, posts, rows } = await rowsFor(dir);
  const post = posts.find((p) => p.slug === slug);
  if (post) return drafts || !post.draft ? { source: "git", entry: entryFor(post, rows) } : null;
  // Unknown slugs stop at the cached slug list instead of querying the database each.
  if (!(await listPublishedNoteSlugs()).includes(slug)) return null;
  const note = await getPublishedNote(slug);
  if (!note) return null;
  return { source: "note", note, entry: entryFor(postFromNote(note), rows) };
}

/** Slugs to prerender: git posts that show here and every published note. Fails on a clash. */
export async function blogStaticSlugs(dir = CONTENT_DIR): Promise<string[]> {
  const drafts = showDrafts();
  const posts = readPosts(dir);
  const noteSlugs = await listPublishedNoteSlugs();
  assertNoSlugClash(
    posts.map((p) => p.slug),
    noteSlugs,
  );
  return [...posts.filter((p) => drafts || !p.draft).map((p) => p.slug), ...noteSlugs];
}
