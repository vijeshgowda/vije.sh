import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";

// @/lib/db reads DATABASE_URL; point it at the local test database before anything connects.
process.env.DATABASE_URL = testDatabaseUrl();
const { getPool } = await import("@/lib/db");
const { loadCurrentUser } = await import("./queries");
const { completeOnboarding, HandleTakenError, upsertProfile } = await import("./mutations");

let db: pg.Client;

beforeAll(async () => {
  db = testClient();
  await db.connect();
});
afterAll(async () => {
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  await truncateApp(db);
});

async function authUser(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ('a@example.test') returning id",
  );
  return rows[0]!.id;
}

describe("auth queries and mutations", () => {
  it("creates a profile on first sign-in and leaves it alone afterwards", async () => {
    const id = await authUser();
    await upsertProfile({ id, displayName: "Ada", avatarUrl: "https://a.example/a" });
    await upsertProfile({ id, displayName: "Changed", avatarUrl: null });
    expect(await loadCurrentUser(id)).toEqual({
      id,
      handle: null,
      displayName: "Ada",
      onboarded: false,
      banned: false,
      roles: [],
    });
  });

  it("returns null without a profile", async () => {
    expect(await loadCurrentUser(await authUser())).toBeNull();
  });

  it("onboards once, with roles and bans in the same lookup", async () => {
    const id = await authUser();
    await upsertProfile({ id, displayName: null, avatarUrl: null });
    expect(await completeOnboarding(id, "Vije")).toBe(true);
    expect(await completeOnboarding(id, "other")).toBe(false);

    const { rows } = await db.query<{ id: string }>(
      "select id from app.categories where slug = 'games'",
    );
    await db.query("insert into app.user_roles (user_id, role) values ($1, 'admin')", [id]);
    await db.query(
      "insert into app.user_roles (user_id, role, category_id) values ($1, 'moderator', $2)",
      [id, rows[0]!.id],
    );
    await db.query(
      "insert into app.user_bans (user_id, reason, expires_at) values ($1, 'old', now() - interval '1 day')",
      [id],
    );
    const user = await loadCurrentUser(id);
    expect(user).toMatchObject({ handle: "Vije", onboarded: true, banned: false });
    expect(user!.roles).toEqual(
      expect.arrayContaining([
        { role: "admin", categoryId: null },
        { role: "moderator", categoryId: rows[0]!.id },
      ]),
    );

    await db.query("insert into app.user_bans (user_id, reason) values ($1, 'spam')", [id]);
    expect((await loadCurrentUser(id))!.banned).toBe(true);
  });

  it("rejects a handle taken in another letter case", async () => {
    const a = await authUser();
    const b = await authUser();
    await upsertProfile({ id: a, displayName: null, avatarUrl: null });
    await upsertProfile({ id: b, displayName: null, avatarUrl: null });
    await completeOnboarding(a, "Vije");
    await expect(completeOnboarding(b, "vIJE")).rejects.toBeInstanceOf(HandleTakenError);
  });

  it("rethrows other database errors", async () => {
    const id = await authUser();
    await upsertProfile({ id, displayName: null, avatarUrl: null });
    await expect(completeOnboarding(id, "bad handle!")).rejects.toMatchObject({ code: "23514" });
  });
});
