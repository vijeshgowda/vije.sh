import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";

/**
 * Moderation writes and reads against the real schema, run as the app's role (`set local role
 * app_rw`, database.md section 3), so a missing grant, a check constraint on moderation_log.action
 * or the replies_counter trigger fails here the way it would in production.
 */
const appPool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });

async function asApp<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await appPool.connect();
  try {
    await c.query("begin");
    await c.query("set local role app_rw");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (err) {
    await c.query("rollback");
    throw err;
  } finally {
    c.release();
  }
}

vi.mock("@/lib/db", () => ({
  query: (sql: string, params: unknown[] = []) => asApp((c) => c.query(sql, params)),
  withTransaction: asApp,
}));

const m = await import("./mutations");
const q = await import("./queries");

let db: pg.Client;
const cats: Record<string, string> = {};
let mod = "";
let author = "";

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
  await appPool.end();
});
beforeEach(async () => {
  await truncateApp(db);
  mod = await user("mod");
  author = await user("Ada");
});

async function user(handle: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${handle}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, now())", [
    id,
    handle,
  ]);
  return id;
}

async function thread(slug = "engineering", body = "Opening **post**."): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     values ($1, $2, 'A thread', $3) returning id::text as id`,
    [cats[slug], author, body],
  );
  return rows[0]!.id;
}

async function reply(threadId: string, body = "A reply."): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into app.replies (thread_id, author_id, body_md) values ($1, $2, $3) returning id::text as id",
    [threadId, author, body],
  );
  return rows[0]!.id;
}

interface LogRow {
  actor_id: string;
  action: string;
  thread_id: string | null;
  reply_id: string | null;
  note: string | null;
}

const log = async () =>
  (
    await db.query<LogRow>(
      `select actor_id, action, thread_id::text as thread_id, reply_id::text as reply_id, note
         from app.moderation_log order by id`,
    )
  ).rows;

const threadState = async (id: string) =>
  (
    await db.query<{
      category_id: string;
      hidden: boolean;
      hidden_by: string | null;
      locked: boolean;
      pinned: boolean;
      reply_count: number;
    }>(
      `select category_id::text as category_id, hidden_at is not null as hidden, hidden_by,
              locked_at is not null as locked, pinned_at is not null as pinned, reply_count
         from app.threads where id = $1`,
      [id],
    )
  ).rows[0]!;

const replyState = async (id: string) =>
  (
    await db.query<{ hidden: boolean; hidden_by: string | null }>(
      "select hidden_at is not null as hidden, hidden_by from app.replies where id = $1",
      [id],
    )
  ).rows[0]!;

describe("setHidden", () => {
  it("hides and unhides a reply, keeps reply_count and logs both", async () => {
    const t = await thread();
    const r = await reply(t);
    expect((await threadState(t)).reply_count).toBe(1);
    const change = { kind: "reply" as const, id: r, categoryId: cats.engineering!, actorId: mod };

    expect(await m.setHidden({ ...change, hidden: true, note: "Spam." })).toBe("ok");
    expect(await replyState(r)).toEqual({ hidden: true, hidden_by: mod });
    expect((await threadState(t)).reply_count).toBe(0);

    expect(await m.setHidden({ ...change, hidden: false })).toBe("ok");
    expect(await replyState(r)).toEqual({ hidden: false, hidden_by: null });
    expect((await threadState(t)).reply_count).toBe(1);

    expect(await log()).toEqual([
      { actor_id: mod, action: "hide", thread_id: null, reply_id: r, note: "Spam." },
      { actor_id: mod, action: "unhide", thread_id: null, reply_id: r, note: null },
    ]);
  });

  it("hides and unhides a thread", async () => {
    const t = await thread();
    const change = { kind: "thread" as const, id: t, categoryId: cats.engineering!, actorId: mod };
    expect(await m.setHidden({ ...change, hidden: true })).toBe("ok");
    expect(await threadState(t)).toMatchObject({ hidden: true, hidden_by: mod });
    expect(await m.setHidden({ ...change, hidden: false })).toBe("ok");
    expect(await threadState(t)).toMatchObject({ hidden: false, hidden_by: null });
    expect((await log()).map((l) => [l.action, l.thread_id, l.reply_id])).toEqual([
      ["hide", t, null],
      ["unhide", t, null],
    ]);
  });

  it("does nothing (and logs nothing) when already in that state", async () => {
    const t = await thread();
    const r = await reply(t);
    const change = { kind: "reply" as const, id: r, categoryId: cats.engineering!, actorId: mod };
    expect(await m.setHidden({ ...change, hidden: false })).toBe("unchanged");
    expect(await log()).toEqual([]);
  });

  it("refuses a post that is gone or moved to another category since the check", async () => {
    const t = await thread("games");
    const r = await reply(t);
    const engineering = cats.engineering!;
    for (const [kind, id] of [
      ["thread", t],
      ["reply", r],
      ["reply", "999999"],
    ] as const) {
      expect(
        await m.setHidden({ kind, id, categoryId: engineering, actorId: mod, hidden: true }),
      ).toBe("stale");
    }
    expect((await threadState(t)).hidden).toBe(false);
    expect(await log()).toEqual([]);
  });
});

describe("setLocked / setPinned", () => {
  it("locks, unlocks, pins and unpins with a log row each", async () => {
    const t = await thread();
    const f = { threadId: t, categoryId: cats.engineering!, actorId: mod };
    expect(await m.setLocked({ ...f, on: true })).toBe("ok");
    expect(await m.setPinned({ ...f, on: true })).toBe("ok");
    expect(await threadState(t)).toMatchObject({ locked: true, pinned: true });
    expect(await m.setLocked({ ...f, on: true })).toBe("unchanged");
    expect(await m.setLocked({ ...f, on: false })).toBe("ok");
    expect(await m.setPinned({ ...f, on: false })).toBe("ok");
    expect(await threadState(t)).toMatchObject({ locked: false, pinned: false });
    expect((await log()).map((l) => [l.action, l.thread_id])).toEqual([
      ["lock", t],
      ["pin", t],
      ["unlock", t],
      ["unpin", t],
    ]);
  });

  it("refuses a thread in another category", async () => {
    const t = await thread("games");
    expect(
      await m.setPinned({ threadId: t, categoryId: cats.engineering!, actorId: mod, on: true }),
    ).toBe("stale");
    expect((await threadState(t)).pinned).toBe(false);
  });
});

describe("moveThread", () => {
  const from = () => ({ id: cats.engineering!, slug: "engineering" });
  const to = () => ({ id: cats.games!, slug: "games" });

  it("moves a thread and logs where from and to", async () => {
    const t = await thread();
    expect(await m.moveThread({ threadId: t, from: from(), to: to(), actorId: mod })).toBe("ok");
    expect((await threadState(t)).category_id).toBe(cats.games);
    expect(await log()).toEqual([
      { actor_id: mod, action: "move", thread_id: t, reply_id: null, note: "engineering -> games" },
    ]);
  });

  it("refuses a thread no longer in the source category, or a missing destination", async () => {
    const t = await thread("games");
    expect(await m.moveThread({ threadId: t, from: from(), to: to(), actorId: mod })).toBe("stale");
    const u = await thread();
    const gone = { id: "999999", slug: "gone" };
    expect(await m.moveThread({ threadId: u, from: from(), to: gone, actorId: mod })).toBe("stale");
    expect(await m.moveThread({ threadId: u, from: from(), to: from(), actorId: mod })).toBe(
      "unchanged",
    );
    expect(await log()).toEqual([]);
  });
});

describe("queries", () => {
  it("targetForModeration reads a thread or a reply with its thread's category and flags", async () => {
    const t = await thread();
    const r = await reply(t);
    await db.query("update app.threads set locked_at = now() where id = $1", [t]);
    expect(await q.targetForModeration("thread", t)).toEqual({
      kind: "thread",
      id: t,
      threadId: t,
      categoryId: cats.engineering,
      categorySlug: "engineering",
      hidden: false,
      locked: true,
      pinned: false,
    });
    expect(await q.targetForModeration("reply", r)).toMatchObject({
      kind: "reply",
      id: r,
      threadId: t,
      categorySlug: "engineering",
    });
    expect(await q.targetForModeration("reply", "999999")).toBeNull();
  });

  it("hiddenSource returns stored text of hidden posts only", async () => {
    const t = await thread("engineering", "<script>alert(1)</script> **raw**");
    const r = await reply(t, "Hidden *reply*");
    expect(await q.hiddenSource("thread", t)).toBeNull();
    expect(await q.hiddenSource("reply", r)).toBeNull();
    await db.query("update app.threads set hidden_at = now() where id = $1", [t]);
    await db.query("update app.replies set hidden_at = now() where id = $1", [r]);
    expect(await q.hiddenSource("thread", t)).toEqual({
      title: "A thread",
      body: "<script>alert(1)</script> **raw**",
      authorHandle: "Ada",
    });
    expect(await q.hiddenSource("reply", r)).toEqual({
      title: null,
      body: "Hidden *reply*",
      authorHandle: "Ada",
    });
  });

  it("hiddenThread finds hidden threads only", async () => {
    const t = await thread();
    expect(await q.hiddenThread(t)).toBeNull();
    await db.query("update app.threads set hidden_at = now() where id = $1", [t]);
    expect(await q.hiddenThread(t)).toMatchObject({
      id: t,
      title: "A thread",
      categoryId: cats.engineering,
      categoryName: "Engineering",
      hiddenAt: expect.any(Date),
    });
  });

  it("lists categories and finds one by slug", async () => {
    const all = await q.listCategoryOptions();
    expect(all.map((c) => c.slug)).toContain("games");
    expect(await q.categoryBySlug("games")).toEqual({
      id: cats.games,
      slug: "games",
      name: "Games",
    });
    expect(await q.categoryBySlug("nowhere")).toBeNull();
  });
});
