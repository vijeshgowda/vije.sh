import "server-only";
import type { PostStatus } from "@/db/types";
import { query, withTransaction } from "@/lib/db";
import { isGitSlug, noteIdSchema, type NoteInput } from "./schemas";

/**
 * Note writes for the owner-only Server Actions (part 2). Each returns the slugs the caller must
 * revalidate (`noteTags(slug, previousSlug)` from ./tags.ts), or null when the note doesn't exist.
 * Callers parse input with noteInputSchema first; the slug checks here are a second line.
 */

export class NoteSlugTakenError extends Error {
  constructor(
    readonly slug: string,
    readonly by: "git" | "note",
  ) {
    super(by === "git" ? `"${slug}" is a git post's slug` : `another note already uses "${slug}"`);
    this.name = "NoteSlugTakenError";
  }
}

const UNIQUE_VIOLATION = "23505";

async function guardSlug<T>(slug: string, write: () => Promise<T>): Promise<T> {
  if (isGitSlug(slug)) throw new NoteSlugTakenError(slug, "git");
  try {
    return await write();
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new NoteSlugTakenError(slug, "note");
    }
    throw err;
  }
}

const validId = (id: string) => noteIdSchema.safeParse(id).success;

/** Creates a draft note. */
export async function createNote(
  authorId: string,
  input: NoteInput,
): Promise<{ id: string; slug: string }> {
  return guardSlug(input.slug, async () => {
    const { rows } = await query<{ id: string; slug: string }>(
      `insert into app.posts (slug, title, summary, body_md, tags, visibility, author_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, slug`,
      [
        input.slug,
        input.title,
        input.summary,
        input.bodyMd,
        input.tags,
        input.visibility,
        authorId,
      ],
    );
    return rows[0]!;
  });
}

export interface UpdatedNote {
  slug: string;
  previousSlug: string;
  status: PostStatus;
}

/** Replaces a note's content; status and dates are unchanged. */
export async function updateNote(id: string, input: NoteInput): Promise<UpdatedNote | null> {
  if (!validId(id)) return null;
  return guardSlug(input.slug, async () => {
    const { rows } = await query<UpdatedNote>(
      `with old as (select id, slug from app.posts where id = $1)
       update app.posts p
          set slug = $2, title = $3, summary = $4, body_md = $5, tags = $6, visibility = $7
         from old
        where p.id = old.id
       returning p.slug, old.slug as "previousSlug", p.status`,
      [id, input.slug, input.title, input.summary, input.bodyMd, input.tags, input.visibility],
    );
    return rows[0] ?? null;
  });
}

/**
 * Publishes a note. The first publication sets published_at; publishing again after unpublishing
 * keeps the original date. Rejects a slug that a git post has taken since the note was written.
 */
export async function publishNote(id: string): Promise<{ slug: string } | null> {
  if (!validId(id)) return null;
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ slug: string }>(
      "select slug from app.posts where id = $1 for update",
      [id],
    );
    const slug = rows[0]?.slug;
    if (slug === undefined) return null;
    if (isGitSlug(slug)) throw new NoteSlugTakenError(slug, "git");
    await c.query(
      `update app.posts
          set status = 'published', published_at = coalesce(published_at, now())
        where id = $1`,
      [id],
    );
    return { slug };
  });
}

/** Back to draft: the note leaves /blog but keeps its publication date. */
export async function unpublishNote(id: string): Promise<{ slug: string } | null> {
  if (!validId(id)) return null;
  const { rows } = await query<{ slug: string }>(
    "update app.posts set status = 'draft' where id = $1 returning slug",
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteNote(id: string): Promise<{ slug: string } | null> {
  if (!validId(id)) return null;
  const { rows } = await query<{ slug: string }>(
    "delete from app.posts where id = $1 returning slug",
    [id],
  );
  return rows[0] ?? null;
}
