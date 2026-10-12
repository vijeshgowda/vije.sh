import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { PostRow } from "@/db/types";
import { query } from "@/lib/db";
import { hasEnv } from "@/lib/env";
import { slugSchema } from "../schemas";
import { isGitSlug, noteIdSchema } from "./schemas";
import { NOTES_TAG, noteTag } from "./tags";

/**
 * Notes: short blog posts stored in app.posts (application.md 9). Public reads are cached with
 * `'use cache'` and the tags in ./tags.ts, and only ever return published notes that aren't
 * private. Admin reads are uncached: /admin is dynamic.
 */

/** Notes get calendar dates in the owner's time zone, like the dates in git frontmatter. */
export const NOTE_TIME_ZONE = "Europe/London";

export interface PublishedNoteSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  /** Publication date, YYYY-MM-DD */
  date: string;
}

export interface PublishedNote extends PublishedNoteSummary {
  bodyMd: string;
  visibility: "public" | "unlisted";
  /** Date of the last edit, YYYY-MM-DD */
  updated: string;
}

const day = (column: string) => `to_char(${column} at time zone '${NOTE_TIME_ZONE}', 'YYYY-MM-DD')`;

const SUMMARY_COLUMNS = `id, slug, title, summary, tags, ${day("published_at")} as date`;

// ---------------------------------------------------------------------------------------------
// Loaders: plain queries that throw on database errors (tested directly).

/** Listed notes (published and public), newest first. */
export async function loadPublishedNotes(): Promise<PublishedNoteSummary[]> {
  const { rows } = await query<PublishedNoteSummary>(
    `select ${SUMMARY_COLUMNS}
       from app.posts
      where status = 'published' and visibility = 'public'
      order by published_at desc, slug`,
  );
  return rows;
}

/** Slugs of every note with a page: published, public or unlisted. */
export async function loadPublishedNoteSlugs(): Promise<string[]> {
  const { rows } = await query<{ slug: string }>(
    `select slug from app.posts
      where status = 'published' and visibility in ('public', 'unlisted')
      order by slug`,
  );
  return rows.map((r) => r.slug);
}

export async function loadPublishedNote(slug: string): Promise<PublishedNote | null> {
  if (!slugSchema.safeParse(slug).success) return null;
  const { rows } = await query<PublishedNote>(
    `select ${SUMMARY_COLUMNS}, body_md as "bodyMd", visibility, ${day("updated_at")} as updated
       from app.posts
      where slug = $1 and status = 'published' and visibility in ('public', 'unlisted')`,
    [slug],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Cached public reads. The site builds and runs without a database (env.ts), and a database that
// is down (a paused Supabase dev project on a preview build) shouldn't take git posts with it:
// both fall back to "no notes", the second only for a few minutes.

type Outcome<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(what: string, load: () => Promise<T>): Promise<Outcome<T>> {
  if (!hasEnv("database")) return { ok: false };
  try {
    return { ok: true, value: await load() };
  } catch (err) {
    console.error(`notes: ${what} failed; serving no notes for now`, err);
    return { ok: false };
  }
}

/** Results are kept until a write revalidates them; a failed read is retried after a minute. */
function lifetime(r: Outcome<unknown>) {
  if (r.ok || !hasEnv("database")) cacheLife("max");
  else cacheLife("minutes");
}

export async function listPublishedNotes(): Promise<PublishedNoteSummary[]> {
  "use cache";
  cacheTag(NOTES_TAG);
  const r = await attempt("listing notes", loadPublishedNotes);
  lifetime(r);
  return r.ok ? r.value : [];
}

export async function listPublishedNoteSlugs(): Promise<string[]> {
  "use cache";
  cacheTag(NOTES_TAG);
  const r = await attempt("listing note slugs", loadPublishedNoteSlugs);
  lifetime(r);
  return r.ok ? r.value : [];
}

/**
 * One published note (public or unlisted) by slug. Callers should check the slug against
 * listPublishedNoteSlugs() first, so unknown URLs never reach the database.
 */
export async function getPublishedNote(slug: string): Promise<PublishedNote | null> {
  "use cache";
  cacheTag(NOTES_TAG, noteTag(slug));
  const r = await attempt(`loading note "${slug}"`, () => loadPublishedNote(slug));
  lifetime(r);
  return r.ok ? r.value : null;
}

// ---------------------------------------------------------------------------------------------
// Admin reads (owner only, part 2 adds the pages). Uncached.

export type AdminNoteListItem = Pick<
  PostRow,
  "id" | "slug" | "title" | "status" | "visibility" | "published_at" | "updated_at"
>;

/** Every note in any state, most recently edited first. */
export async function listNotesForAdmin(): Promise<AdminNoteListItem[]> {
  const { rows } = await query<AdminNoteListItem>(
    `select id, slug, title, status, visibility, published_at, updated_at
       from app.posts
      order by updated_at desc, id desc`,
  );
  return rows;
}

/** A note in any state, or null for a malformed or unknown id. */
export async function getNoteById(id: string): Promise<PostRow | null> {
  if (!noteIdSchema.safeParse(id).success) return null;
  const { rows } = await query<PostRow>(
    `select id, slug, title, summary, body_md, status, visibility, tags, author_id,
            published_at, created_at, updated_at
       from app.posts
      where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Why a slug can't be used for a note: a git post has it, or another note does (pass the id of
 * the note being edited as `exceptId`). Null when it's free.
 */
export async function noteSlugConflict(
  slug: string,
  exceptId?: string,
): Promise<"git" | "note" | null> {
  if (isGitSlug(slug)) return "git";
  const { rows } = await query(
    `select 1 from app.posts where slug = $1 and ($2::bigint is null or id <> $2::bigint)`,
    [slug, exceptId ?? null],
  );
  return rows.length > 0 ? "note" : null;
}
