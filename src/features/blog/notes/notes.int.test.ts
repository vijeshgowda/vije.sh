import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../../tests/helpers/db";

// @/lib/db reads DATABASE_URL; point it at the local test database before anything connects.
process.env.DATABASE_URL = testDatabaseUrl();
// 'use cache' is a no-op outside Next.js, but cacheLife/cacheTag throw there.
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const { getPool } = await import("@/lib/db");
const q = await import("./queries");
const m = await import("./mutations");
const { noteInputSchema } = await import("./schemas");
const catalog = await import("../server/catalog");
const { readPosts } = await import("../posts");

let db: pg.Client;
let author: string;

beforeAll(async () => {
  db = testClient();
  await db.connect();
});
afterAll(async () => {
  // leave no notes behind for the e2e build that may run next on this database
  await truncateApp(db);
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  await truncateApp(db);
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ('owner@example.test') returning id",
  );
  author = rows[0]!.id;
  await db.query(
    "insert into app.profiles (id, handle, onboarded_at) values ($1, 'owner', now())",
    [author],
  );
});

const input = (over: Record<string, unknown> = {}) =>
  noteInputSchema.parse({ slug: "a-note", title: "A note", bodyMd: "Hello **world**", ...over });

async function published(slug: string, at: string, over: Record<string, unknown> = {}) {
  const { id } = await m.createNote(author, input({ slug, title: slug, ...over }));
  await m.publishNote(id);
  await db.query("update app.posts set published_at = $2 where id = $1", [id, at]);
  return id;
}

describe("note mutations", () => {
  it("creates a draft that no public read returns", async () => {
    const created = await m.createNote(author, input({ summary: "S", tags: "Ideas, x" }));
    expect(created).toEqual({ id: expect.stringMatching(/^\d+$/), slug: "a-note" });
    const row = await q.getNoteById(created.id);
    expect(row).toMatchObject({
      slug: "a-note",
      title: "A note",
      summary: "S",
      body_md: "Hello **world**",
      tags: ["Ideas", "x"],
      status: "draft",
      visibility: "public",
      author_id: author,
      published_at: null,
    });
    expect(await q.loadPublishedNotes()).toEqual([]);
    expect(await q.loadPublishedNoteSlugs()).toEqual([]);
    expect(await q.loadPublishedNote("a-note")).toBeNull();
  });

  it("publishes once: the first date sticks through unpublish and republish", async () => {
    const { id } = await m.createNote(author, input());
    expect(await m.publishNote(id)).toEqual({ slug: "a-note" });
    const first = (await q.getNoteById(id))!.published_at;
    expect(first).toBeInstanceOf(Date);
    await db.query("update app.posts set published_at = '2026-01-02T12:00:00Z' where id = $1", [
      id,
    ]);

    expect(await m.unpublishNote(id)).toEqual({ slug: "a-note" });
    expect(await q.getNoteById(id)).toMatchObject({ status: "draft" });
    expect(await q.loadPublishedNotes()).toEqual([]);

    await m.publishNote(id);
    expect(await q.loadPublishedNotes()).toEqual([
      { id, slug: "a-note", title: "A note", summary: null, tags: [], date: "2026-01-02" },
    ]);
  });

  it("updates content and reports the slug before and after", async () => {
    const { id } = await m.createNote(author, input());
    expect(
      await m.updateNote(id, input({ slug: "renamed", title: "New", visibility: "unlisted" })),
    ).toEqual({
      slug: "renamed",
      previousSlug: "a-note",
      status: "draft",
    });
    expect(await q.getNoteById(id)).toMatchObject({ slug: "renamed", visibility: "unlisted" });
    expect(await m.updateNote("999", input())).toBeNull();
    expect(await m.updateNote("nope", input())).toBeNull();
  });

  it("refuses slugs taken by another note or a git post", async () => {
    await m.createNote(author, input({ slug: "taken" }));
    const { id } = await m.createNote(author, input({ slug: "free" }));
    await expect(m.createNote(author, input({ slug: "taken" }))).rejects.toMatchObject({
      name: "NoteSlugTakenError",
      by: "note",
      slug: "taken",
    });
    await expect(m.updateNote(id, input({ slug: "taken" }))).rejects.toBeInstanceOf(
      m.NoteSlugTakenError,
    );
    // the schema already refuses git slugs; the mutation checks again
    const gitSlug = readPosts()[0]!.slug;
    await expect(m.createNote(author, { ...input(), slug: gitSlug })).rejects.toMatchObject({
      by: "git",
    });
  });

  it("won't publish a note whose slug a git post has taken since", async () => {
    const gitSlug = readPosts()[0]!.slug;
    const { rows } = await db.query<{ id: string }>(
      "insert into app.posts (slug, title, author_id) values ($1, 'Old', $2) returning id",
      [gitSlug, author],
    );
    await expect(m.publishNote(rows[0]!.id)).rejects.toMatchObject({ by: "git" });
    expect(await q.getNoteById(rows[0]!.id)).toMatchObject({ status: "draft" });
  });

  it("rethrows other database errors", async () => {
    await expect(
      m.createNote("00000000-0000-0000-0000-000000000000", input()),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("deletes, and answers null for unknown or malformed ids", async () => {
    const { id } = await m.createNote(author, input());
    expect(await m.deleteNote(id)).toEqual({ slug: "a-note" });
    expect(await q.getNoteById(id)).toBeNull();
    for (const missing of ["999", "x"]) {
      expect(await m.deleteNote(missing)).toBeNull();
      expect(await m.publishNote(missing)).toBeNull();
      expect(await m.unpublishNote(missing)).toBeNull();
    }
  });
});

describe("note queries", () => {
  it("lists public published notes newest first; unlisted ones only by slug", async () => {
    const older = await published("older", "2026-03-01T12:00:00Z", { tags: ["Ideas"] });
    const newer = await published("newer", "2026-04-01T12:00:00Z", { summary: "Sum" });
    await published("hidden", "2026-05-01T12:00:00Z", { visibility: "unlisted" });
    await published("secret", "2026-05-01T12:00:00Z", { visibility: "private" });
    await m.createNote(author, input({ slug: "draft" }));

    const list = [
      { id: newer, slug: "newer", title: "newer", summary: "Sum", tags: [], date: "2026-04-01" },
      {
        id: older,
        slug: "older",
        title: "older",
        summary: null,
        tags: ["Ideas"],
        date: "2026-03-01",
      },
    ];
    expect(await q.loadPublishedNotes()).toEqual(list);
    expect(await q.listPublishedNotes()).toEqual(list);
    expect(await q.listPublishedNoteSlugs()).toEqual(["hidden", "newer", "older"]);
    expect(await q.getPublishedNote("hidden")).toMatchObject({
      visibility: "unlisted",
      bodyMd: "Hello **world**",
    });
    expect(await q.getPublishedNote("secret")).toBeNull();
    expect(await q.getPublishedNote("draft")).toBeNull();

    const admin = await q.listNotesForAdmin();
    expect(admin.map((n) => n.slug)).toEqual(["draft", "secret", "hidden", "newer", "older"]);
    expect(Object.keys(admin[0]!).sort()).toEqual(
      ["id", "published_at", "slug", "status", "title", "updated_at", "visibility"].sort(),
    );
  });

  it("dates notes in the owner's time zone", async () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST)
    await published("late", "2026-06-30T23:30:00Z");
    expect((await q.loadPublishedNotes())[0]!.date).toBe("2026-07-01");
    const note = await q.loadPublishedNote("late");
    expect(note!.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("explains why a slug is unavailable", async () => {
    const { id } = await m.createNote(author, input({ slug: "mine" }));
    expect(await q.noteSlugConflict(readPosts()[0]!.slug)).toBe("git");
    expect(await q.noteSlugConflict("mine")).toBe("note");
    expect(await q.noteSlugConflict("mine", id)).toBeNull();
    expect(await q.noteSlugConflict("free")).toBeNull();
  });
});

describe("blog catalog with notes", () => {
  it("merges notes into the numbered list and opens them by slug", async () => {
    const gitRows = await catalog.blogNoteRows();
    await published("fresh-note", "2099-01-01T12:00:00Z", { summary: "New" });
    const rows = await catalog.blogNoteRows();
    expect(rows).toHaveLength(gitRows.length + 1);
    expect(rows[0]).toMatchObject({
      slug: "fresh-note",
      id: `AN-${String(rows.length).padStart(3, "0")}`,
    });
    expect(await catalog.latestBlogNotes(1)).toEqual([rows[0]]);

    const found = await catalog.getBlogEntry("fresh-note");
    expect(found).toMatchObject({
      source: "note",
      note: { slug: "fresh-note", bodyMd: "Hello **world**" },
      entry: { id: rows[0]!.id, older: rows[1], newer: undefined },
    });
    const git = await catalog.getBlogEntry(rows[1]!.slug);
    expect(git).toMatchObject({ source: "git", entry: { newer: rows[0] } });
    expect(await catalog.getBlogEntry("no-such-note")).toBeNull();
    expect(await catalog.blogStaticSlugs()).toEqual(
      expect.arrayContaining(["fresh-note", rows[1]!.slug]),
    );
  });

  it("fails the build when a published note and a git post share a slug", async () => {
    const gitSlug = readPosts()[0]!.slug;
    await db.query(
      `insert into app.posts (slug, title, author_id, status, published_at)
       values ($1, 'Clash', $2, 'published', now())`,
      [gitSlug, author],
    );
    await expect(catalog.blogStaticSlugs()).rejects.toThrow(/share the slug/);
    // visitors still get the git post
    expect(await catalog.getBlogEntry(gitSlug)).toMatchObject({ source: "git" });
  });
});
