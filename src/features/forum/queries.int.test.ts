import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

// @/lib/db reads DATABASE_URL; point it at the local test database before anything connects.
process.env.DATABASE_URL = testDatabaseUrl();
const { cacheTag } = await import("next/cache");
const { getPool } = await import("@/lib/db");
const { THREADS_PER_LIST } = await import("./format");
const q = await import("./queries");

let db: pg.Client;
const cats: Record<string, string> = {};

beforeAll(async () => {
  db = testClient();
  await db.connect();
  const { rows } = await db.query<{ id: string; slug: string }>(
    "select id::text as id, slug from app.categories order by position, name",
  );
  for (const r of rows) cats[r.slug] = r.id;
});
afterAll(async () => {
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  await truncateApp(db);
  vi.mocked(cacheTag).mockClear();
});

async function user(handle: string, grants: [string, string | null][] = []): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${handle}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, now())", [
    id,
    handle,
  ]);
  for (const [role, slug] of grants) {
    await db.query("insert into app.user_roles (user_id, role, category_id) values ($1, $2, $3)", [
      id,
      role,
      slug ? cats[slug] : null,
    ]);
  }
  return id;
}

interface ThreadOpts {
  slug?: string;
  author?: string | null;
  title?: string;
  body?: string;
  at?: string;
  pinned?: boolean;
  locked?: boolean;
  hidden?: boolean;
  edited?: boolean;
}

async function thread({
  slug = "engineering",
  author = null,
  title = "A thread",
  body = "Body",
  at = "2026-10-01T10:00:00Z",
  pinned = false,
  locked = false,
  hidden = false,
  edited = false,
}: ThreadOpts = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, created_at, last_activity_at,
                              pinned_at, locked_at, hidden_at, edited_at)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9) returning id::text as id`,
    [
      cats[slug],
      author,
      title,
      body,
      at,
      pinned ? at : null,
      locked ? at : null,
      hidden ? at : null,
      edited ? at : null,
    ],
  );
  return rows[0]!.id;
}

async function reply(
  threadId: string,
  author: string | null,
  body: string,
  at: string,
  { hidden = false, edited = false } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md, created_at, hidden_at, edited_at)
     values ($1, $2, $3, $4, $5, $6) returning id::text as id`,
    [threadId, author, body, at, hidden ? at : null, edited ? at : null],
  );
  return rows[0]!.id;
}

describe("databaseReady", () => {
  it("answers true against the test database", async () => {
    expect(await q.databaseReady()).toBe(true);
  });
});

describe("categories", () => {
  it("lists every category in order, staff-only ones marked", async () => {
    const list = await q.listCategories();
    expect(list.map((c) => c.slug)).toEqual([
      "announcements",
      "engineering",
      "local-ai",
      "games",
      "off-topic",
    ]);
    expect(list[0]).toMatchObject({ slug: "announcements", staffOnly: true });
    expect(list[1]).toEqual({
      id: cats.engineering,
      slug: "engineering",
      name: "Engineering",
      description: "Backend, infrastructure, tooling.",
      staffOnly: false,
    });
    expect(cacheTag).toHaveBeenCalledWith("forum");
  });

  it("finds a category by slug, staff-only ones included", async () => {
    expect(await q.getCategory("games")).toMatchObject({
      id: cats.games,
      name: "Games",
      staffOnly: false,
    });
    expect(cacheTag).toHaveBeenCalledWith("forum", "category:games");
    expect(await q.getCategory("announcements")).toMatchObject({
      id: cats.announcements,
      staffOnly: true,
    });
    expect(await q.getCategory("nope")).toBeNull();
  });
});

describe("thread lists", () => {
  it("lists a category's visible threads, pinned first, then by latest activity", async () => {
    const ada = await user("Ada");
    const old = await thread({ author: ada, title: "Old", at: "2026-10-01T10:00:00Z" });
    const pinned = await thread({ title: "Pinned", at: "2026-09-01T10:00:00Z", pinned: true });
    const fresh = await thread({ author: ada, title: "Fresh", at: "2026-10-03T10:00:00Z" });
    await thread({ title: "Hidden", at: "2026-10-04T10:00:00Z", hidden: true });
    await thread({ slug: "games", title: "Elsewhere" });
    // a reply bumps "Old" above "Fresh"; a hidden reply is not counted
    await reply(old, ada, "bump", "2026-10-05T10:00:00Z");
    await reply(old, ada, "spam", "2026-10-05T11:00:00Z", { hidden: true });

    const list = await q.listCategoryThreads("engineering");
    expect(list.map((t) => t.id)).toEqual([pinned, old, fresh]);
    expect(list[1]).toEqual({
      id: old,
      title: "Old",
      category: { slug: "engineering", name: "Engineering" },
      authorHandle: "Ada",
      replyCount: 1,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      lastActivityAt: new Date("2026-10-05T10:00:00Z"),
      pinned: false,
      locked: false,
    });
    expect(list[0]).toMatchObject({ pinned: true, authorHandle: null });
    expect(cacheTag).toHaveBeenCalledWith("forum", "category:engineering");
  });

  it("lists the latest visible threads across every category", async () => {
    const a = await thread({ slug: "games", at: "2026-10-02T10:00:00Z", locked: true });
    const b = await thread({ slug: "local-ai", at: "2026-10-03T10:00:00Z", pinned: true });
    const c = await thread({ slug: "engineering", at: "2026-10-01T10:00:00Z" });
    const news = await thread({ slug: "announcements", at: "2026-10-04T10:00:00Z" });
    await thread({ slug: "off-topic", at: "2026-10-05T10:00:00Z", hidden: true });

    const list = await q.listLatestThreads();
    expect(list.map((t) => t.id)).toEqual([news, b, a, c]);
    expect(list[2]).toMatchObject({ locked: true, category: { slug: "games", name: "Games" } });
    expect(cacheTag).toHaveBeenCalledWith(
      "forum",
      "category:announcements",
      "category:engineering",
      "category:local-ai",
      "category:games",
      "category:off-topic",
    );
  });

  it(`stops at ${THREADS_PER_LIST} threads`, async () => {
    await db.query(
      `insert into app.threads (category_id, title, body_md)
       select $1, 'Thread ' || n, 'Body' from generate_series(1, $2::int) n`,
      [cats.engineering, THREADS_PER_LIST + 2],
    );
    expect(await q.listCategoryThreads("engineering")).toHaveLength(THREADS_PER_LIST);
    expect(await q.listLatestThreads()).toHaveLength(THREADS_PER_LIST);
  });
});

describe("getThread", () => {
  it("returns the thread with every frame, roles per category and hidden placeholders", async () => {
    const owner = await user("vijesh", [["admin", null]]);
    const globalMod = await user("mod", [["moderator", null]]);
    const gamesMod = await user("gamemod", [["moderator", "games"]]);
    const su = await user("superu", [["superuser", null]]);
    const engMod = await user("engmod", [["moderator", "engineering"]]);
    const ada = await user("ada");
    const id = await thread({
      author: owner,
      title: "Welcome",
      body: "# Hello",
      pinned: true,
      locked: true,
      edited: true,
    });
    const r1 = await reply(id, ada, "First", "2026-10-01T11:00:00Z");
    const r2 = await reply(id, ada, "Spam body", "2026-10-01T12:00:00Z", {
      hidden: true,
      edited: true,
    });
    const r3 = await reply(id, globalMod, "Global", "2026-10-01T13:00:00Z", { edited: true });
    const r4 = await reply(id, gamesMod, "Out of scope", "2026-10-01T14:00:00Z");
    const r5 = await reply(id, engMod, "In scope", "2026-10-01T15:00:00Z");
    const r6 = await reply(id, null, "Orphan", "2026-10-01T16:00:00Z");
    const r7 = await reply(id, su, "Super", "2026-10-01T17:00:00Z");

    const t = await q.getThread(id);
    expect(cacheTag).toHaveBeenCalledWith("forum", `thread:${id}`);
    expect(t).toMatchObject({
      id,
      title: "Welcome",
      category: {
        id: cats.engineering,
        slug: "engineering",
        name: "Engineering",
        description: "Backend, infrastructure, tooling.",
        staffOnly: false,
      },
      createdAt: new Date("2026-10-01T10:00:00Z"),
      pinned: true,
      locked: true,
    });
    expect(t!.frames).toEqual([
      {
        key: `thread-${id}`,
        kind: "thread",
        id,
        no: 0,
        createdAt: new Date("2026-10-01T10:00:00Z"),
        editedAt: new Date("2026-10-01T10:00:00Z"),
        hidden: false,
        author: { handle: "vijesh", role: "admin" },
        bodyMd: "# Hello",
      },
      expect.objectContaining({
        key: `reply-${r1}`,
        no: 1,
        author: { handle: "ada", role: "member" },
        bodyMd: "First",
        editedAt: null,
      }),
      {
        key: `reply-${r2}`,
        kind: "reply",
        id: r2,
        no: 2,
        createdAt: new Date("2026-10-01T12:00:00Z"),
        editedAt: null,
        hidden: true,
        author: null,
        bodyMd: null,
      },
      expect.objectContaining({
        id: r3,
        no: 3,
        author: { handle: "mod", role: "moderator" },
        editedAt: new Date("2026-10-01T13:00:00Z"),
      }),
      expect.objectContaining({ id: r4, no: 4, author: { handle: "gamemod", role: "member" } }),
      expect.objectContaining({ id: r5, no: 5, author: { handle: "engmod", role: "moderator" } }),
      expect.objectContaining({ id: r6, no: 6, author: null, bodyMd: "Orphan", hidden: false }),
      expect.objectContaining({ id: r7, no: 7, author: { handle: "superu", role: "superuser" } }),
    ]);
    // the hidden body never leaves the database
    expect(JSON.stringify(t)).not.toContain("Spam body");
  });

  it("returns threads in staff-only categories to everyone", async () => {
    const id = await thread({ slug: "announcements", title: "Site news" });
    expect(await q.getThread(id)).toMatchObject({
      title: "Site news",
      category: { slug: "announcements", staffOnly: true },
    });
  });

  it("returns null for missing and hidden threads", async () => {
    expect(await q.getThread("999")).toBeNull();
    expect(await q.getThread(await thread({ hidden: true }))).toBeNull();
  });
});

describe("the write path's reads (uncached)", () => {
  it("finds a category to post in, with its staff-only flag", async () => {
    expect(await q.categoryForPost("announcements")).toEqual({
      id: cats.announcements,
      slug: "announcements",
      name: "Announcements",
      staffOnly: true,
    });
    expect(await q.categoryForPost("games")).toMatchObject({ staffOnly: false });
    expect(await q.categoryForPost("nope")).toBeNull();
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it("finds a visible thread to reply to, with its lock and category", async () => {
    const open = await thread({ slug: "games" });
    const locked = await thread({ locked: true });
    expect(await q.threadForReply(open)).toEqual({
      id: open,
      categoryId: cats.games,
      categorySlug: "games",
      locked: false,
    });
    expect(await q.threadForReply(locked)).toMatchObject({ locked: true });
    expect(await q.threadForReply(await thread({ hidden: true }))).toBeNull();
    expect(await q.threadForReply("999")).toBeNull();
  });

  it("loads a visible post with its author and source for editing", async () => {
    const ada = await user("ada");
    const t = await thread({ author: ada, title: "Mine", body: "**raw**" });
    const r = await reply(t, ada, "a *reply*", "2026-10-01T11:00:00Z");
    const hiddenReply = await reply(t, ada, "gone", "2026-10-01T12:00:00Z", { hidden: true });
    expect(await q.postForEdit("thread", t)).toEqual({
      kind: "thread",
      id: t,
      threadId: t,
      categoryId: cats.engineering,
      categorySlug: "engineering",
      authorId: ada,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      title: "Mine",
      body: "**raw**",
    });
    expect(await q.postForEdit("reply", r)).toEqual({
      kind: "reply",
      id: r,
      threadId: t,
      categoryId: cats.engineering,
      categorySlug: "engineering",
      authorId: ada,
      createdAt: new Date("2026-10-01T11:00:00Z"),
      title: null,
      body: "a *reply*",
    });
    expect(await q.postForEdit("reply", hiddenReply)).toBeNull();
    expect(await q.postForEdit("thread", "999")).toBeNull();
    // a reply in a hidden thread can't be edited either
    await db.query("update app.threads set hidden_at = now() where id = $1", [t]);
    expect(await q.postForEdit("thread", t)).toBeNull();
    expect(await q.postForEdit("reply", r)).toBeNull();
  });

  it("counts an author's threads and replies inside the window, hidden ones included", async () => {
    const ada = await user("ada");
    const bob = await user("bob");
    const now = new Date();
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const t = await thread({ author: ada, at: ago(10 * 60_000) });
    await thread({ author: ada, at: ago(20 * 60_000), hidden: true });
    await thread({ author: ada, at: ago(2 * 3_600_000) });
    await thread({ author: bob, at: ago(60_000) });
    await reply(t, ada, "1", ago(60_000));
    await reply(t, ada, "2", ago(59 * 60_000), { hidden: true });
    await reply(t, ada, "3", ago(61 * 60_000));
    await reply(t, bob, "4", ago(60_000));

    expect(await q.countRecentThreads(ada, 3_600_000)).toBe(2);
    expect(await q.countRecentThreads(ada, 3 * 3_600_000)).toBe(3);
    expect(await q.countRecentReplies(ada, 3_600_000)).toBe(2);
    expect(await q.countRecentReplies(bob, 3_600_000)).toBe(1);
    expect(await q.countRecentReplies(await user("cyd"), 3_600_000)).toBe(0);
  });
});

describe("listSitemapThreads", () => {
  it("lists visible threads by latest activity with their category, tagged for every category", async () => {
    const old = await thread({ slug: "games", at: "2026-10-01T10:00:00Z" });
    const recent = await thread({ slug: "announcements", at: "2026-10-03T10:00:00Z" });
    await thread({ at: "2026-10-04T10:00:00Z", hidden: true });
    expect(await q.listSitemapThreads()).toEqual([
      {
        id: recent,
        categorySlug: "announcements",
        lastActivityAt: new Date("2026-10-03T10:00:00Z"),
      },
      { id: old, categorySlug: "games", lastActivityAt: new Date("2026-10-01T10:00:00Z") },
    ]);
    expect(cacheTag).toHaveBeenCalledWith(
      "forum",
      ...Object.keys(cats).map((s) => `category:${s}`),
    );
  });
});
