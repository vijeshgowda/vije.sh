import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as pg from "pg";
import { testClient, truncateApp } from "../helpers/db";

// Runs against the local test database built by `npm run db:test:setup`.
let db: pg.Client;

beforeAll(async () => {
  db = testClient();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await truncateApp(db);
});

async function user(handle: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${handle}@example.com`],
  );
  const id = rows[0]!.id;
  await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, now())", [
    id,
    handle,
  ]);
  return id;
}

async function thread(authorId: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     select id, $1, 'Hello there', 'Body' from app.categories where slug = 'engineering' returning id`,
    [authorId],
  );
  return rows[0]!.id;
}

const replyCount = async (id: string) =>
  (
    await db.query<{ reply_count: number }>("select reply_count from app.threads where id = $1", [
      id,
    ])
  ).rows[0]!.reply_count;

describe("schema", () => {
  it("seeds the forum categories", async () => {
    const { rows } = await db.query("select slug from app.categories order by position");
    expect(rows.map((r) => r.slug)).toEqual([
      "announcements",
      "engineering",
      "local-ai",
      "games",
      "off-topic",
    ]);
  });

  it("keeps reply_count in step with visible replies", async () => {
    const u = await user("nora");
    const t = await thread(u);
    const { rows } = await db.query<{ id: string }>(
      "insert into app.replies (thread_id, author_id, body_md) values ($1, $2, 'a'), ($1, $2, 'b') returning id",
      [t, u],
    );
    expect(await replyCount(t)).toBe(2);
    await db.query("update app.replies set hidden_at = now() where id = $1", [rows[0]!.id]);
    expect(await replyCount(t)).toBe(1);
    await db.query("update app.replies set hidden_at = null where id = $1", [rows[0]!.id]);
    expect(await replyCount(t)).toBe(2);
    await db.query("delete from app.replies where id = $1", [rows[1]!.id]);
    expect(await replyCount(t)).toBe(1);
  });

  it("enforces handle format and the onboarding rule", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ('x@y.z') returning id",
    );
    await expect(
      db.query("insert into app.profiles (id, handle) values ($1, 'no spaces')", [rows[0]!.id]),
    ).rejects.toThrow(/check/);
    await expect(
      db.query("insert into app.profiles (id, onboarded_at) values ($1, now())", [rows[0]!.id]),
    ).rejects.toThrow(/profiles_onboarded_has_handle/);
  });

  it("allows admin only as a global role and one grant per scope", async () => {
    const u = await user("vije");
    await db.query("insert into app.user_roles (user_id, role) values ($1, 'admin')", [u]);
    await expect(
      db.query("insert into app.user_roles (user_id, role) values ($1, 'admin')", [u]),
    ).rejects.toThrow(/user_roles_unique/);
    await expect(
      db.query(
        "insert into app.user_roles (user_id, role, category_id) select $1, 'admin', id from app.categories limit 1",
        [u],
      ),
    ).rejects.toThrow(/user_roles_admin_global/);
  });

  it("a report targets exactly one thing", async () => {
    const u = await user("mei");
    const t = await thread(u);
    await expect(
      db.query("insert into app.reports (reporter_id, reason) values ($1, 'spam')", [u]),
    ).rejects.toThrow(/reports_one_target/);
    await db.query(
      "insert into app.reports (reporter_id, thread_id, reason) values ($1, $2, 'spam')",
      [u, t],
    );
  });

  it("deleting a user keeps their threads as [deleted]", async () => {
    const u = await user("ravi");
    const t = await thread(u);
    await db.query("delete from auth.users where id = $1", [u]);
    const { rows } = await db.query("select author_id from app.threads where id = $1", [t]);
    expect(rows[0].author_id).toBeNull();
  });

  it("updated_at moves on update", async () => {
    const u = await user("tomas");
    const before = (await db.query("select updated_at from app.profiles where id = $1", [u]))
      .rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 10));
    await db.query("update app.profiles set bio = 'hi' where id = $1", [u]);
    const after = (await db.query("select updated_at from app.profiles where id = $1", [u])).rows[0]
      .updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
