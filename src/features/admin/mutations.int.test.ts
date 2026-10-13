import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import type { Role } from "@/db/types";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";
import { asAppRw } from "../../../tests/helpers/app-rw";
import { categoryIds, insertUser } from "../../../tests/helpers/users";

// mutations run as the app's role, so the owner-guard trigger and the grants apply
vi.mock("@/lib/db", async (orig) => asAppRw(await orig()));

process.env.DATABASE_URL = testDatabaseUrl();
const { getPool } = await import("@/lib/db");
const m = await import("./mutations");

let db: pg.Client;
let cats: Record<string, string>;
let actor: string;
let target: string;

beforeAll(async () => {
  db = testClient();
  await db.connect();
  cats = await categoryIds(db);
});
afterAll(async () => {
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  await truncateApp(db);
  actor = await insertUser(db, "owner", { roles: ["admin"] });
  target = await insertUser(db, "nora");
});

const yes = () => true;

async function grants(userId = target) {
  const { rows } = await db.query<{ role: Role; slug: string | null; granted_by: string | null }>(
    `select r.role, c.slug, r.granted_by from app.user_roles r
       left join app.categories c on c.id = r.category_id
      where r.user_id = $1 order by r.role, c.position nulls first`,
    [userId],
  );
  return rows;
}

async function log() {
  const { rows } = await db.query<{
    actor_id: string;
    action: string;
    profile_id: string;
    note: string | null;
  }>("select actor_id, action, profile_id, note from app.moderation_log order by id");
  return rows;
}

async function bans() {
  const { rows } = await db.query<{
    reason: string;
    banned_by: string;
    days: number | null;
    lifted: boolean;
  }>(
    `select reason, banned_by, round(extract(epoch from expires_at - created_at) / 86400)::int as days,
            lifted_at is not null as lifted
       from app.user_bans where user_id = $1 order by id`,
    [target],
  );
  return rows;
}

const change = (role: "superuser" | "moderator", categoryId: string | null = null) => ({
  actorId: actor,
  targetId: target,
  role,
  categoryId,
});

describe("grantRole()", () => {
  it("grants a global or per-category moderator, each with a log row", async () => {
    expect(await m.grantRole(change("moderator"), yes)).toBe("ok");
    expect(await m.grantRole(change("moderator", cats.games!), yes)).toBe("ok");
    expect(await grants()).toEqual([
      { role: "moderator", slug: null, granted_by: actor },
      { role: "moderator", slug: "games", granted_by: actor },
    ]);
    expect(await log()).toEqual([
      { actor_id: actor, action: "role_grant", profile_id: target, note: "moderator" },
      { actor_id: actor, action: "role_grant", profile_id: target, note: "moderator in games" },
    ]);
  });

  it("does nothing for a grant the user already has", async () => {
    await m.grantRole(change("moderator"), yes);
    expect(await m.grantRole(change("moderator"), yes)).toBe("unchanged");
    expect(await log()).toHaveLength(1);
  });

  it("refuses a category that doesn't exist", async () => {
    expect(await m.grantRole(change("moderator", "999999"), yes)).toBe("invalid");
    expect(await grants()).toEqual([]);
    expect(await log()).toEqual([]);
  });

  it("granting superuser removes the user's moderator grants, logged as revokes", async () => {
    await m.grantRole(change("moderator"), yes);
    await m.grantRole(change("moderator", cats.engineering!), yes);
    expect(await m.grantRole(change("superuser"), yes)).toBe("ok");
    expect(await grants()).toEqual([{ role: "superuser", slug: null, granted_by: actor }]);
    expect((await log()).slice(2).map((r) => [r.action, r.note])).toEqual([
      ["role_grant", "superuser"],
      ["role_revoke", "moderator (now a superuser)"],
      ["role_revoke", "moderator in engineering (now a superuser)"],
    ]);
  });
});

describe("revokeRole()", () => {
  it("revokes exactly the grant named, with a log row", async () => {
    await m.grantRole(change("moderator"), yes);
    await m.grantRole(change("moderator", cats.games!), yes);
    expect(await m.revokeRole(change("moderator", cats.engineering!), yes)).toBe("unchanged");
    expect(await m.revokeRole(change("moderator", cats.games!), yes)).toBe("ok");
    expect(await grants()).toEqual([{ role: "moderator", slug: null, granted_by: actor }]);
    expect(await m.revokeRole(change("moderator"), yes)).toBe("ok");
    expect(await grants()).toEqual([]);
    expect((await log()).slice(2).map((r) => [r.action, r.note])).toEqual([
      ["role_revoke", "moderator in games"],
      ["role_revoke", "moderator"],
    ]);
  });

  it("revokes superuser", async () => {
    await m.grantRole(change("superuser"), yes);
    expect(await m.revokeRole(change("superuser"), yes)).toBe("ok");
    expect(await grants()).toEqual([]);
  });
});

describe("permission re-check under the row lock", () => {
  it("passes the target's current roles to the check and writes nothing when it fails", async () => {
    await db.query("insert into app.user_roles (user_id, role) values ($1, 'superuser')", [target]);
    const seen: Role[][] = [];
    const check = (roles: Role[]) => {
      seen.push(roles);
      return !roles.includes("superuser");
    };
    expect(await m.grantRole(change("moderator"), check)).toBe("forbidden");
    expect(await m.revokeRole(change("superuser"), check)).toBe("forbidden");
    expect(
      await m.banUser({ actorId: actor, targetId: target, reason: "x", days: null }, check),
    ).toBe("forbidden");
    expect(await m.liftBan({ actorId: actor, targetId: target }, check)).toBe("forbidden");
    expect(seen).toEqual([["superuser"], ["superuser"], ["superuser"], ["superuser"]]);
    expect(await grants()).toHaveLength(1);
    expect(await bans()).toEqual([]);
    expect(await log()).toEqual([]);
  });

  it("refuses a target whose profile is gone", async () => {
    await db.query("delete from auth.users where id = $1", [target]);
    expect(await m.grantRole(change("moderator"), yes)).toBe("forbidden");
  });
});

describe("the owner can't be created or removed by the app (database trigger)", () => {
  it("rejects granting or revoking admin even if a check let it through", async () => {
    const asOwner = { ...change("moderator"), role: "admin" as "moderator" };
    await expect(m.grantRole(asOwner, yes)).rejects.toThrow(/owner/i);
    await expect(m.revokeRole({ ...asOwner, targetId: actor }, yes)).rejects.toThrow(/owner/i);
    expect(await grants(actor)).toEqual([{ role: "admin", slug: null, granted_by: null }]);
    expect(await grants()).toEqual([]);
    expect(await log()).toEqual([]);
  });
});

describe("banUser() and liftBan()", () => {
  const ban = (days: number | null, reason = "spam") =>
    m.banUser({ actorId: actor, targetId: target, reason, days }, yes);

  it("bans for a number of days, or permanently, logging the reason", async () => {
    expect(await ban(7)).toBe("ok");
    expect(await ban(null)).toBe("unchanged");
    expect(await m.liftBan({ actorId: actor, targetId: target }, yes)).toBe("ok");
    expect(await ban(null, "again")).toBe("ok");
    expect(await bans()).toEqual([
      { reason: "spam", banned_by: actor, days: 7, lifted: true },
      { reason: "again", banned_by: actor, days: null, lifted: false },
    ]);
    expect((await log()).map((r) => [r.action, r.note, r.profile_id])).toEqual([
      ["ban", "spam (7 d)", target],
      ["unban", null, target],
      ["ban", "again", target],
    ]);
  });

  it("an expired ban doesn't block a new one, and isn't lifted", async () => {
    await db.query(
      `insert into app.user_bans (user_id, reason, created_at, expires_at)
       values ($1, 'old', now() - interval '3 days', now() - interval '1 day')`,
      [target],
    );
    expect(await m.liftBan({ actorId: actor, targetId: target }, yes)).toBe("unchanged");
    expect(await ban(1)).toBe("ok");
    expect((await bans()).map((b) => [b.reason, b.lifted])).toEqual([
      ["old", false],
      ["spam", false],
    ]);
  });

  it("rolls the change back when its log row can't be written", async () => {
    await ban(null);
    const ghost = "00000000-0000-4000-8000-000000000000";
    await expect(m.liftBan({ actorId: ghost, targetId: target }, yes)).rejects.toThrow(
      /moderation_log_actor_id_fkey/,
    );
    expect((await bans()).map((b) => b.lifted)).toEqual([false]);
    expect(await log()).toHaveLength(1);
  });
});

// the shared helper (features/moderation/mutations.ts) that every change above logs through
describe("logModeration()", () => {
  it("writes thread, reply and profile targets", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into app.threads (category_id, title, body_md) values ($1, 'A thread', 'Body')
       returning id::text as id`,
      [cats.games],
    );
    const { withTransaction } = await import("@/lib/db");
    const { logModeration } = await import("@/features/moderation/mutations");
    await withTransaction((client) =>
      logModeration(client, { actorId: actor, action: "lock", threadId: rows[0]!.id }),
    );
    const { rows: logged } = await db.query(
      "select action, thread_id::text, reply_id, profile_id, note from app.moderation_log",
    );
    expect(logged).toEqual([
      { action: "lock", thread_id: rows[0]!.id, reply_id: null, profile_id: null, note: null },
    ]);
  });
});
