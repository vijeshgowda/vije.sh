import type { APIRequestContext } from "@playwright/test";
import { testClient } from "../helpers/db";

/**
 * Notes straight in the test database, for specs that need published content without the admin
 * editor. Pages are static, so after a write the spec expires the cache tags through the test-mode
 * route (src/app/api/test/revalidate), as the owner's Server Actions do with revalidateTag().
 */

export interface SeededNote {
  id: string;
  slug: string;
}

export async function seedNote(note: {
  slug: string;
  title: string;
  authorId: string;
  bodyMd: string;
  summary?: string | null;
  tags?: string[];
  visibility?: "public" | "unlisted" | "private";
  publishedAt?: Date | null;
}): Promise<SeededNote> {
  const db = testClient();
  await db.connect();
  try {
    const { rows } = await db.query<SeededNote>(
      `insert into app.posts (slug, title, summary, body_md, tags, visibility, author_id, status, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, slug`,
      [
        note.slug,
        note.title,
        note.summary ?? null,
        note.bodyMd,
        note.tags ?? [],
        note.visibility ?? "public",
        note.authorId,
        note.publishedAt === null ? "draft" : "published",
        note.publishedAt === null ? null : (note.publishedAt ?? new Date()),
      ],
    );
    return rows[0]!;
  } finally {
    await db.end();
  }
}

export async function deleteNote(id: string) {
  const db = testClient();
  await db.connect();
  try {
    await db.query("delete from app.posts where id = $1", [id]);
  } finally {
    await db.end();
  }
}

/** Expires cache tags on the running server (AUTH_MODE=test only). */
export async function revalidateTags(request: APIRequestContext, tags: string[]) {
  const res = await request.post("/api/test/revalidate", {
    headers: { "x-test-secret": process.env.TEST_AUTH_SECRET! },
    data: { tags },
  });
  if (res.status() !== 204) throw new Error(`revalidate failed: HTTP ${res.status()}`);
}

/** Cleanup for notes a spec created through the editor (no id known if it failed midway). */
export async function deleteNoteBySlug(slug: string) {
  const db = testClient();
  await db.connect();
  try {
    await db.query("delete from app.posts where slug = $1", [slug]);
  } finally {
    await db.end();
  }
}
