import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as pg from "pg";
import { testClient, truncateApp } from "../helpers/db";

// Migration 0003: staff roles, the single owner and its protection from the app role.
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

const grant = (userId: string, role: string, categoryId: string | null = null) =>
  db.query("insert into app.user_roles (user_id, role, category_id) values ($1, $2, $3)", [
    userId,
    role,
    categoryId,
  ]);

const categoryId = async (slug: string) =>
  (await db.query<{ id: string }>("select id from app.categories where slug = $1", [slug])).rows[0]!
    .id;

/** Runs fn as the app's role (database.md section 3) inside a transaction that is rolled back. */
async function asApp<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role app_rw");
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

describe("staff roles (0003)", () => {
  it("allows exactly one owner", async () => {
    await grant(await user("vije"), "admin");
    await expect(grant(await user("mallory"), "admin")).rejects.toThrow(/user_roles_one_owner_idx/);
  });

  it("keeps owner and superuser global; moderators may be scoped", async () => {
    const u = await user("nora");
    const games = await categoryId("games");
    await expect(grant(u, "superuser", games)).rejects.toThrow(/user_roles_scope/);
    await expect(grant(u, "admin", games)).rejects.toThrow(/user_roles_scope/);
    await grant(u, "moderator", games);
    await grant(u, "moderator");
    await grant(u, "superuser");
    const { rows } = await db.query<{ role: string }>(
      "select role from app.user_roles where user_id = $1 order by role, category_id nulls first",
      [u],
    );
    // the enum sorts by rank: owner, superuser, moderator
    expect(rows.map((r) => r.role)).toEqual(["superuser", "moderator", "moderator"]);
  });

  it("stops the app role from granting, changing or revoking the owner", async () => {
    const owner = await user("vije");
    const other = await user("mallory");
    await grant(owner, "admin");

    for (const sql of [
      ["insert into app.user_roles (user_id, role) values ($1, 'admin')", other],
      ["delete from app.user_roles where user_id = $1", owner],
      ["update app.user_roles set user_id = $1 where role = 'admin'", other],
      ["update app.user_roles set role = 'superuser' where user_id = $1", owner],
    ] as const) {
      await expect(asApp(() => db.query(sql[0], [sql[1]]))).rejects.toMatchObject({
        code: "42501",
        message: expect.stringMatching(/owner role/),
      });
    }
    await expect(
      asApp(async () => {
        await grant(other, "moderator");
        return db.query("update app.user_roles set role = 'admin' where user_id = $1", [other]);
      }),
    ).rejects.toMatchObject({ code: "42501" });

    const { rows } = await db.query("select user_id from app.user_roles where role = 'admin'");
    expect(rows).toEqual([{ user_id: owner }]);
  });

  it("lets the app role manage moderators and superusers", async () => {
    const owner = await user("vije");
    const u = await user("nora");
    const games = await categoryId("games");
    const roles = await asApp(async () => {
      await grant(u, "moderator", games);
      await grant(u, "superuser");
      await db.query(
        "insert into app.moderation_log (actor_id, action, profile_id, note) values ($1, 'role_grant', $2, 'superuser')",
        [owner, u],
      );
      await db.query("delete from app.user_roles where user_id = $1 and role = 'moderator'", [u]);
      return (
        await db.query<{ role: string }>("select role from app.user_roles where user_id = $1", [u])
      ).rows;
    });
    expect(roles).toEqual([{ role: "superuser" }]);
  });

  it("still removes the owner's roles when the account itself is deleted", async () => {
    const owner = await user("vije");
    await grant(owner, "admin");
    // cascades run as the table owner, not as app_rw
    const left = await asApp(async () => {
      await db.query("delete from app.profiles where id = $1", [owner]);
      return (await db.query("select 1 from app.user_roles")).rowCount;
    });
    expect(left).toBe(0);
    await db.query("delete from auth.users where id = $1", [owner]);
    expect((await db.query("select 1 from app.user_roles")).rowCount).toBe(0);
  });

  it("lets the app role compare handles in any letter case", async () => {
    const u = await user("Vije");
    await grant(u, "moderator");
    const find = (sql: string) =>
      db.query(
        `select p.handle, r.role
           from app.profiles p join app.user_roles r on r.user_id = p.id
          where ${sql}`,
        ["vIJE"],
      );
    // Without `extensions` on the search path, `=` quietly compares as case-sensitive text...
    expect((await asApp(() => find("p.handle = $1"))).rows).toEqual([]);
    // ...so name the citext operator (needs USAGE on schema extensions, as does Supabase's
    // default search path, which includes `extensions`).
    const want = [{ handle: "Vije", role: "moderator" }];
    expect((await asApp(() => find("p.handle operator(extensions.=) $1"))).rows).toEqual(want);
    const viaPath = await asApp(async () => {
      await db.query(`set local search_path = "$user", public, extensions`);
      return (await find("p.handle = $1")).rows;
    });
    expect(viaPath).toEqual(want);
  });

  it("logs category changes", async () => {
    const owner = await user("vije");
    await asApp(() =>
      db.query(
        `insert into app.moderation_log (actor_id, action, note)
         select $1, a, 'games' from unnest(array['category_create', 'category_update', 'category_delete']) a`,
        [owner],
      ),
    );
    await expect(
      db.query("insert into app.moderation_log (actor_id, action) values ($1, 'category_rename')", [
        owner,
      ]),
    ).rejects.toThrow(/moderation_log_action_check/);
  });
});
