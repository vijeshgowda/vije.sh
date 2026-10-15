import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";
import { asAppRw } from "../../../tests/helpers/app-rw";
import { categoryIds, insertUser } from "../../../tests/helpers/users";

// every query runs as the app's role, so a missing grant fails here
vi.mock("@/lib/db", async (orig) => asAppRw(await orig()));

process.env.DATABASE_URL = testDatabaseUrl();
const { getPool } = await import("@/lib/db");
const { MEMBERS_PER_PAGE } = await import("./members");
const q = await import("./queries");

// git posts are counted in queries.test.ts; here only the database side
const EMPTY_CONTENT = "/nonexistent/content/blog";

let db: pg.Client;
let cats: Record<string, string>;

beforeAll(async () => {
  db = testClient();
  await db.connect();
  cats = await categoryIds(db);
});
afterAll(async () => {
  await db.end();
  await getPool().end();
});
beforeEach(() => truncateApp(db));

async function thread(slug: string, author: string | null = null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     values ($1, $2, 'A thread', 'Body') returning id::text as id`,
    [cats[slug], author],
  );
  return rows[0]!.id;
}

const ban = (userId: string, extra = "") =>
  db.query(
    `insert into app.user_bans (user_id, reason, expires_at, lifted_at)
     select $1, 'spam', ${extra || "null, null"}`,
    [userId],
  );

describe("loadAdminStats()", () => {
  it("counts an empty forum", async () => {
    const s = await q.loadAdminStats(EMPTY_CONTENT);
    expect(s).toMatchObject({
      members: 0,
      onboarded: 0,
      new7d: 0,
      new30d: 0,
      threads: 0,
      replies: 0,
      openReports: 0,
      activeBans: 0,
      notes: { git: 0, db: 0 },
    });
    expect(s.databaseBytes).toBeGreaterThan(0);
    expect(s.categories.map((c) => c.slug)).toEqual([
      "announcements",
      "engineering",
      "local-ai",
      "games",
      "off-topic",
    ]);
    expect(s.categories.every((c) => c.threads === 0)).toBe(true);
  });

  it("counts members, new sign-ups, posts, reports, bans and notes", async () => {
    const a = await insertUser(db, "alice");
    const b = await insertUser(db, "bob", { age: "10 days" });
    const c = await insertUser(db, "carol", { age: "40 days" });
    await insertUser(db, "dave", { onboarded: false, age: "3 days" });

    const t1 = await thread("engineering", a);
    await thread("engineering", b);
    await thread("games", c);
    for (const body of ["one", "two", "three"]) {
      await db.query(
        "insert into app.replies (thread_id, author_id, body_md) values ($1, $2, $3)",
        [t1, b, body],
      );
    }
    await db.query(
      `insert into app.reports (reporter_id, thread_id, profile_id, reason, status) values
         ($1, $3, null, 'spam', 'open'), ($2, $3, null, 'spam', 'open'),
         ($1, null, $4, 'old', 'dismissed')`,
      [a, b, t1, c],
    );

    await ban(b); // active, permanent
    await ban(b, "now() + interval '1 day', null"); // a second active ban: still one user
    await ban(c, "now() - interval '1 day', null"); // expired
    await ban(a, "null, now()"); // lifted

    await db.query(
      `insert into app.posts (slug, title, author_id, status, published_at)
       values ('one', 'One', $1, 'published', now()), ('two', 'Two', $1, 'draft', null)`,
      [a],
    );

    const s = await q.loadAdminStats(EMPTY_CONTENT);
    expect(s).toMatchObject({
      members: 4,
      onboarded: 3,
      new7d: 2,
      new30d: 3,
      threads: 3,
      replies: 3,
      openReports: 2,
      activeBans: 1,
      notes: { git: 0, db: 2 },
    });
    const per = Object.fromEntries(s.categories.map((x) => [x.slug, x.threads]));
    expect(per).toMatchObject({ engineering: 2, games: 1, announcements: 0 });
  });
});

describe("searchMembers()", () => {
  it("lists everyone newest first with roles, join date and ban state", async () => {
    const old = await insertUser(db, "old_timer", { age: "2 days", roles: ["superuser"] });
    await insertUser(db, "newbie", {
      displayName: "New Bie",
      roles: ["moderator", { moderator: "games" }],
    });
    await ban(old);

    const r = await q.searchMembers("", 1);
    expect(r).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(r.members.map((m) => m.handle)).toEqual(["newbie", "old_timer"]);
    expect(r.members[0]).toMatchObject({
      displayName: "New Bie",
      onboarded: true,
      banned: false,
      roles: [
        { role: "moderator", categoryId: null, categoryName: null },
        { role: "moderator", categoryId: cats.games, categoryName: "Games" },
      ],
    });
    expect(r.members[0]!.joinedAt).toBeInstanceOf(Date);
    expect(r.members[1]).toMatchObject({
      banned: true,
      roles: [{ role: "superuser", categoryId: null, categoryName: null }],
    });
  });

  it("matches handle or display name in any letter case", async () => {
    await insertUser(db, "NoraK", { displayName: "Nora Kay" });
    await insertUser(db, "bob", { displayName: "Bob, NORA's friend" });
    await insertUser(db, "carol");

    const handles = async (text: string) =>
      (await q.searchMembers(text, 1)).members.map((m) => m.handle).sort();
    expect(await handles("nora")).toEqual(["NoraK", "bob"]);
    expect(await handles("KAY")).toEqual(["NoraK"]);
    expect(await handles("zzz")).toEqual([]);
  });

  it("treats %, _ and \\ as literal characters", async () => {
    await insertUser(db, "a_b");
    await insertUser(db, "axb");
    await insertUser(db, "pct", { displayName: "100% real" });
    await insertUser(db, "pcx", { displayName: "100 real" });
    await insertUser(db, "slash", { displayName: "back\\slash" });
    await insertUser(db, "noslash", { displayName: "backslash" });

    const handles = async (text: string) =>
      (await q.searchMembers(text, 1)).members.map((m) => m.handle).sort();
    expect(await handles("a_b")).toEqual(["a_b"]);
    expect(await handles("_")).toEqual(["a_b"]);
    expect(await handles("%")).toEqual(["pct"]);
    expect(await handles("0% r")).toEqual(["pct"]);
    expect(await handles("\\")).toEqual(["slash"]);
    expect(await handles("k\\s")).toEqual(["slash"]);
  });

  it("pages by MEMBERS_PER_PAGE", async () => {
    const n = MEMBERS_PER_PAGE + 3;
    await db.query(
      `with u as (
         insert into auth.users (email)
         select 'm' || i || '@example.test' from generate_series(1, $1) i returning id, email)
       insert into app.profiles (id, handle, onboarded_at, created_at)
       select id, split_part(email, '@', 1) || '_x', now(),
              now() - (split_part(split_part(email, '@', 1), 'm', 2)::int * interval '1 minute')
         from u`,
      [n],
    );
    const p1 = await q.searchMembers("", 1);
    const p2 = await q.searchMembers("", 2);
    expect(p1).toMatchObject({ total: n, pages: 2, page: 1 });
    expect(p1.members).toHaveLength(MEMBERS_PER_PAGE);
    expect(p2.members.map((m) => m.handle)).toEqual(["m51_x", "m52_x", "m53_x"]);
    expect((await q.searchMembers("", 3)).members).toEqual([]);
    expect((await q.searchMembers("m52", 1)).total).toBe(1);
  });
});

describe("getMember() and getTarget()", () => {
  it("finds a member by handle in any letter case, with grants and ban history", async () => {
    const owner = await insertUser(db, "owner", { roles: ["admin"] });
    const id = await insertUser(db, "Nora", { displayName: "Nora K" });
    await db.query(
      "insert into app.user_roles (user_id, role, category_id, granted_by) values ($1, 'moderator', $2, $3)",
      [id, cats.games, owner],
    );
    await db.query(
      `insert into app.user_bans (user_id, reason, banned_by, created_at, expires_at)
       values ($1, 'old', $2, now() - interval '9 days', now() - interval '2 days'),
              ($1, 'spam', $2, now(), null)`,
      [id, owner],
    );

    const m = await q.getMember("nORA");
    expect(m).toMatchObject({
      id,
      handle: "Nora",
      displayName: "Nora K",
      onboarded: true,
      roles: ["moderator"],
      grants: [
        { role: "moderator", categoryId: cats.games, categoryName: "Games", grantedBy: "owner" },
      ],
    });
    expect(m!.bans.map((b) => [b.reason, b.active, b.bannedBy])).toEqual([
      ["spam", true, "owner"],
      ["old", false, "owner"],
    ]);
    expect(m!.bans[0]!.expiresAt).toBeNull();
    expect(m!.bans[1]!.expiresAt).toBeInstanceOf(Date);

    expect(await q.getTarget("NORA")).toEqual({ id, roles: ["moderator"] });
    expect(await q.getTarget("owner")).toEqual({ id: owner, roles: ["admin"] });
  });

  it("returns null for unknown handles, and no roles for plain members", async () => {
    const id = await insertUser(db, "plain");
    expect(await q.getMember("nobody")).toBeNull();
    expect(await q.getTarget("nobody")).toBeNull();
    expect(await q.getTarget("plain")).toEqual({ id, roles: [] });
    expect((await q.getMember("plain"))!.grants).toEqual([]);
  });
});

describe("listCategoryOptions()", () => {
  it("lists categories in forum order", async () => {
    const opts = await q.listCategoryOptions();
    expect(opts.map((c) => c.name)).toEqual([
      "Announcements",
      "Engineering",
      "Local AI",
      "Games",
      "Off-topic",
    ]);
    expect(opts[1]!.id).toBe(cats.engineering);
  });
});
