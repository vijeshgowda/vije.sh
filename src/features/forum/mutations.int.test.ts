import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";

/**
 * Forum writes against the real schema, run as the app's role (`set local role app_rw`, database.md
 * section 3), so a missing grant or a trigger that the app's role can't run fails here.
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
  await appPool.end();
});
beforeEach(async () => {
  await truncateApp(db);
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

interface ThreadState {
  title: string;
  body_md: string;
  reply_count: number;
  last_activity_at: Date;
  created_at: Date;
  edited_at: Date | null;
}

const threadRow = async (id: string) =>
  (
    await db.query<ThreadState>(
      `select title, body_md, reply_count, last_activity_at, created_at, edited_at
         from app.threads where id = $1`,
      [id],
    )
  ).rows[0]!;

describe("insertThread", () => {
  it("starts a thread with the author and fresh activity", async () => {
    const ada = await user("ada");
    const id = await m.insertThread({
      categoryId: cats.games!,
      authorId: ada,
      title: "Hello",
      body: "First **post**",
      staff: false,
    });
    expect(id).toMatch(/^\d+$/);
    const { rows } = await db.query(
      "select category_id::text as c, author_id as a from app.threads where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ c: cats.games, a: ada });
    const t = await threadRow(id!);
    expect(t).toMatchObject({ title: "Hello", body_md: "First **post**", reply_count: 0 });
    expect(t.last_activity_at).toEqual(t.created_at);
    expect(t.edited_at).toBeNull();
  });

  it("refuses staff-only categories unless the author is staff, and unknown ones", async () => {
    const ada = await user("ada");
    const post = (categoryId: string, staff: boolean) =>
      m.insertThread({ categoryId, authorId: ada, title: "News", body: "Body", staff });
    expect(await post(cats.announcements!, false)).toBeNull();
    expect(await post("999999", true)).toBeNull();
    expect(await post(cats.announcements!, true)).toMatch(/^\d+$/);
  });

  it("leaves length limits to the database's check constraints", async () => {
    const ada = await user("ada");
    await expect(
      m.insertThread({
        categoryId: cats.games!,
        authorId: ada,
        title: "Hi",
        body: "x",
        staff: false,
      }),
    ).rejects.toThrow(/threads_title_check/);
  });
});

describe("insertReply", () => {
  async function thread(opts: { locked?: boolean; hidden?: boolean } = {}) {
    const { rows } = await db.query<{ id: string }>(
      `insert into app.threads (category_id, title, body_md, created_at, last_activity_at,
                                locked_at, hidden_at)
       values ($1, 'Topic', 'B', now() - interval '1 day', now() - interval '1 day', $2, $3)
       returning id::text as id`,
      [cats.engineering, opts.locked ? new Date() : null, opts.hidden ? new Date() : null],
    );
    return rows[0]!.id;
  }

  it("adds a reply; the trigger counts it and bumps the thread's activity", async () => {
    const ada = await user("ada");
    const t = await thread();
    const before = await threadRow(t);
    const id = await m.insertReply({ threadId: t, authorId: ada, body: "Me too", staff: false });
    expect(id).toMatch(/^\d+$/);
    const after = await threadRow(t);
    expect(after.reply_count).toBe(1);
    expect(after.last_activity_at.getTime()).toBeGreaterThan(before.last_activity_at.getTime());
    const { rows } = await db.query<{ created_at: Date; author_id: string; body_md: string }>(
      "select created_at, author_id, body_md from app.replies where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({ author_id: ada, body_md: "Me too" });
    expect(after.last_activity_at).toEqual(rows[0]!.created_at);
  });

  it("refuses locked threads unless the author is staff, and hidden or missing threads", async () => {
    const ada = await user("ada");
    const locked = await thread({ locked: true });
    const reply = (threadId: string, staff: boolean) =>
      m.insertReply({ threadId, authorId: ada, body: "Hi", staff });
    expect(await reply(locked, false)).toBeNull();
    expect(await reply(locked, true)).toMatch(/^\d+$/);
    expect(await reply(await thread({ hidden: true }), true)).toBeNull();
    expect(await reply("999999", true)).toBeNull();
    expect((await threadRow(locked)).reply_count).toBe(1);
  });
});

describe("updateThread and updateReply", () => {
  it("edits the title and body and marks them edited; hidden posts stay as they are", async () => {
    const ada = await user("ada");
    const t = (await m.insertThread({
      categoryId: cats.games!,
      authorId: ada,
      title: "Old",
      body: "Old body",
      staff: false,
    }))!;
    const r = (await m.insertReply({ threadId: t, authorId: ada, body: "Old", staff: false }))!;
    const activity = (await threadRow(t)).last_activity_at;

    expect(await m.updateThread({ id: t, title: "New title", body: "New body" })).toBe(true);
    expect(await threadRow(t)).toMatchObject({ title: "New title", body_md: "New body" });
    expect((await threadRow(t)).edited_at).toBeInstanceOf(Date);

    expect(await m.updateReply({ id: r, body: "New reply" })).toBe(true);
    const { rows } = await db.query("select body_md, edited_at from app.replies where id = $1", [
      r,
    ]);
    expect(rows[0]).toMatchObject({ body_md: "New reply", edited_at: expect.any(Date) });
    // an edit isn't activity
    expect((await threadRow(t)).last_activity_at).toEqual(activity);

    await db.query("update app.replies set hidden_at = now() where id = $1", [r]);
    expect(await m.updateReply({ id: r, body: "Sneaky" })).toBe(false);
    await db.query("update app.replies set hidden_at = null where id = $1", [r]);
    await db.query("update app.threads set hidden_at = now() where id = $1", [t]);
    expect(await m.updateThread({ id: t, title: "Sneaky", body: "Sneaky" })).toBe(false);
    expect(await m.updateReply({ id: r, body: "Sneaky" })).toBe(false);
    expect(await m.updateThread({ id: "999999", title: "None", body: "None" })).toBe(false);
  });
});
