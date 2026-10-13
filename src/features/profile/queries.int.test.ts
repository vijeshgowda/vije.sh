import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

// @/lib/db reads DATABASE_URL; point it at the local test database before anything connects.
process.env.DATABASE_URL = testDatabaseUrl();
const { cacheLife, cacheTag } = await import("next/cache");
const { getPool } = await import("@/lib/db");
const { RECENT_POSTS } = await import("./format");
const { getProfile } = await import("./queries");

let db: pg.Client;
const cats: Record<string, string> = {};

beforeAll(async () => {
  db = testClient();
  await db.connect();
  const { rows } = await db.query<{ id: string; slug: string }>(
    "select id::text as id, slug from app.categories",
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
  vi.mocked(cacheLife).mockClear();
});

const JOINED = "2026-10-01T08:00:00Z";

async function user(
  handle: string,
  { onboarded = true, grants = [] as [string, string | null][], banned = false } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${handle}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, $3)", [
    id,
    handle,
    onboarded ? JOINED : null,
  ]);
  for (const [role, slug] of grants) {
    await db.query("insert into app.user_roles (user_id, role, category_id) values ($1, $2, $3)", [
      id,
      role,
      slug ? cats[slug] : null,
    ]);
  }
  if (banned) {
    await db.query("insert into app.user_bans (user_id, reason) values ($1, 'spam')", [id]);
  }
  return id;
}

async function thread(
  author: string,
  title: string,
  at: string,
  { slug = "engineering", hidden = false } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, created_at, hidden_at)
     values ($1, $2, $3, 'Body', $4, $5) returning id::text as id`,
    [cats[slug], author, title, at, hidden ? at : null],
  );
  return rows[0]!.id;
}

async function reply(threadId: string, author: string, at: string, { hidden = false } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md, created_at, hidden_at)
     values ($1, $2, 'Reply', $3, $4) returning id::text as id`,
    [threadId, author, at, hidden ? at : null],
  );
  return rows[0]!.id;
}

describe("getProfile", () => {
  it("finds a member by handle in any casing and returns the stored casing", async () => {
    await user("Ada_99");
    for (const h of ["Ada_99", "ada_99", "ADA_99"]) {
      expect(await getProfile(h)).toEqual({
        handle: "Ada_99",
        role: "member",
        joinedAt: new Date(JOINED),
        threadCount: 0,
        replyCount: 0,
        posts: [],
      });
    }
  });

  it("is null for unknown handles and unfinished sign-ups, cached for minutes only", async () => {
    await user("pending", { onboarded: false });
    expect(await getProfile("nobody")).toBeNull();
    expect(await getProfile("pending")).toBeNull();
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("forum");
  });

  it("keeps banned members' profiles", async () => {
    await user("banned_one", { banned: true });
    expect(await getProfile("banned_one")).toMatchObject({ handle: "banned_one" });
  });

  it("shows the highest global role; category moderators show as members", async () => {
    await user("owner", { grants: [["admin", null]] });
    await user("super", { grants: [["superuser", null]] });
    await user("globalmod", { grants: [["moderator", null]] });
    await user("catmod", { grants: [["moderator", "engineering"]] });
    expect((await getProfile("owner"))!.role).toBe("admin");
    expect((await getProfile("super"))!.role).toBe("superuser");
    expect((await getProfile("globalmod"))!.role).toBe("moderator");
    expect((await getProfile("catmod"))!.role).toBe("member");
  });

  it("lists visible posts newest first and counts only those", async () => {
    const ada = await user("ada");
    const bob = await user("bob");
    const t1 = await thread(ada, "Pooling with pg", "2026-10-02T10:00:00Z");
    const hiddenThread = await thread(ada, "Hidden thread", "2026-10-02T11:00:00Z", {
      hidden: true,
    });
    const bobs = await thread(bob, "Small models", "2026-10-03T10:00:00Z", { slug: "local-ai" });
    const r1 = await reply(bobs, ada, "2026-10-04T10:00:00Z");
    await reply(bobs, ada, "2026-10-05T10:00:00Z", { hidden: true });
    // a visible reply in a hidden thread is hidden with it
    await reply(hiddenThread, ada, "2026-10-06T10:00:00Z");
    await reply(t1, bob, "2026-10-07T10:00:00Z");

    const profile = await getProfile("ada");
    expect(profile).toMatchObject({ threadCount: 1, replyCount: 1 });
    expect(profile!.posts).toEqual([
      {
        kind: "reply",
        id: r1,
        threadId: bobs,
        threadTitle: "Small models",
        category: { slug: "local-ai", name: "Local AI" },
        createdAt: new Date("2026-10-04T10:00:00Z"),
      },
      {
        kind: "thread",
        id: t1,
        threadId: t1,
        threadTitle: "Pooling with pg",
        category: { slug: "engineering", name: "Engineering" },
        createdAt: new Date("2026-10-02T10:00:00Z"),
      },
    ]);
  });

  it(`keeps the latest ${RECENT_POSTS} posts and counts them all`, async () => {
    const ada = await user("ada");
    const t = await thread(ada, "Busy thread", "2026-10-01T00:00:00Z");
    for (let i = 1; i <= RECENT_POSTS + 4; i++) {
      await reply(t, ada, new Date(Date.UTC(2026, 9, 1, i)).toISOString());
    }
    const profile = await getProfile("ada");
    expect(profile!.replyCount).toBe(RECENT_POSTS + 4);
    expect(profile!.posts).toHaveLength(RECENT_POSTS);
    expect(profile!.posts[0]!.createdAt).toEqual(new Date(Date.UTC(2026, 9, 1, RECENT_POSTS + 4)));
    expect(profile!.posts.every((p) => p.kind === "reply")).toBe(true);
  });

  it("is tagged with the profile, the forum and every category, and never returns the id", async () => {
    const id = await user("ada");
    const profile = await getProfile("ada");
    expect(cacheLife).toHaveBeenCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith(
      `profile:${id}`,
      "forum",
      ...Object.keys(cats).map((s) => `category:${s}`),
    );
    expect(JSON.stringify(profile)).not.toContain(id);
  });
});
