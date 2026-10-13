import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../tests/helpers/db";
import { asAppRw } from "../../../tests/helpers/app-rw";
import { categoryIds, insertUser } from "../../../tests/helpers/users";
import type { Target } from "./members";

vi.mock("@/lib/db", async (orig) => asAppRw(await orig()));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  refresh: vi.fn(),
  revalidateTag: vi.fn(),
}));
// the session is mocked (application.md 13.3): getCurrentUser() loads whoever `signedIn` names
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/features/auth/session", async () => {
  const { loadCurrentUser } = await import("@/features/auth/queries");
  return {
    getCurrentUser: async () => (session.userId ? loadCurrentUser(session.userId) : null),
  };
});
// lets a test hand the action a stale view of the target (a change raced in before the lock)
const stale = vi.hoisted(() => ({ target: null as Target | null }));
vi.mock("./queries", async (orig) => {
  const real = await orig<typeof import("./queries")>();
  return { ...real, getTarget: async (h: string) => stale.target ?? real.getTarget(h) };
});

process.env.DATABASE_URL = testDatabaseUrl();
const { refresh, revalidateTag } = await import("next/cache");
const { getPool } = await import("@/lib/db");
const a = await import("./actions");

let db: pg.Client;
let cats: Record<string, string>;
const ids: Record<string, string> = {};

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
  vi.clearAllMocks();
  stale.target = null;
  await truncateApp(db);
  ids.owner = await insertUser(db, "owner", { roles: ["admin"] });
  ids.su = await insertUser(db, "sue", { roles: ["superuser"] });
  ids.su2 = await insertUser(db, "sam", { roles: ["superuser"] });
  ids.mod = await insertUser(db, "moe", { roles: [{ moderator: "games" }] });
  ids.nora = await insertUser(db, "Nora");
  ids.bannedSu = await insertUser(db, "bad_su", { roles: ["superuser"] });
  await db.query("insert into app.user_bans (user_id, reason) values ($1, 'x')", [ids.bannedSu]);
});

const as = (who: string | null) => {
  if (who && !ids[who]) throw new Error(`no test user ${who}`);
  session.userId = who ? ids[who]! : null;
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const grant = (fields: Record<string, string>) => a.grantRoleAction({}, form(fields));
const revoke = (fields: Record<string, string>) => a.revokeRoleAction({}, form(fields));
const ban = (fields: Record<string, string>) => a.banAction({}, form(fields));
const lift = (handle: string) => a.liftBanAction({}, form({ handle }));

const REFUSED = { error: "You can't change this member." };

async function rolesOf(id: string) {
  const { rows } = await db.query<{ role: string; slug: string | null }>(
    `select r.role, c.slug from app.user_roles r left join app.categories c on c.id = r.category_id
      where r.user_id = $1 order by r.role, c.position nulls first`,
    [id],
  );
  return rows.map((r) => (r.slug ? `${r.role}:${r.slug}` : r.role));
}
const logCount = async () =>
  (await db.query<{ n: number }>("select count(*)::int as n from app.moderation_log")).rows[0]!.n;
const activeBans = async (id: string) =>
  (
    await db.query<{ n: number }>(
      `select count(*)::int as n from app.user_bans
        where user_id = $1 and lifted_at is null and (expires_at is null or expires_at > now())`,
      [id],
    )
  ).rows[0]!.n;

describe("grantRoleAction", () => {
  it("lets a superuser make a member a moderator, any handle case, and refreshes forum pills", async () => {
    as("su");
    expect(await grant({ handle: "nora", role: "moderator", categoryId: "" })).toEqual({
      ok: "@nora is now a moderator.",
    });
    expect(
      await grant({ handle: "NORA", role: "moderator", categoryId: cats.engineering! }),
    ).toEqual({ ok: "@NORA is now a moderator for one category." });
    expect(await rolesOf(ids.nora!)).toEqual(["moderator", "moderator:engineering"]);
    expect(revalidateTag).toHaveBeenCalledWith("forum", "max");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("lets only the owner make a superuser, which replaces moderator grants", async () => {
    as("su");
    expect(await grant({ handle: "moe", role: "superuser" })).toEqual(REFUSED);
    as("owner");
    expect(await grant({ handle: "moe", role: "superuser" })).toEqual({
      ok: "@moe is now a superuser.",
    });
    expect(await rolesOf(ids.mod!)).toEqual(["superuser"]);
    expect(await logCount()).toBe(2);
  });

  it("refuses superusers acting on superusers or the owner, and anyone acting on themselves", async () => {
    as("su");
    for (const handle of ["sam", "owner", "sue"]) {
      expect(await grant({ handle, role: "moderator" }), handle).toEqual(REFUSED);
    }
    as("owner");
    expect(await grant({ handle: "owner", role: "superuser" })).toEqual(REFUSED);
    expect(await grant({ handle: "sam", role: "moderator" })).toEqual(REFUSED);
    expect(await logCount()).toBe(0);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses guests, members, moderators, banned staff and unknown handles", async () => {
    for (const who of [null, "nora", "mod", "bannedSu"] as const) {
      as(who);
      expect(await grant({ handle: "sam", role: "moderator" }), String(who)).toEqual(REFUSED);
    }
    as("owner");
    expect(await grant({ handle: "ghost", role: "moderator" })).toEqual(REFUSED);
    expect(await logCount()).toBe(0);
  });

  it("explains invalid input, duplicates and missing categories", async () => {
    as("owner");
    expect(await grant({ handle: "nora", role: "admin" })).toEqual({ error: "Pick a role." });
    expect(await grant({ handle: "nora", role: "superuser", categoryId: "3" })).toEqual({
      error: "Only moderators can be limited to one category.",
    });
    await grant({ handle: "nora", role: "moderator" });
    expect(await grant({ handle: "nora", role: "moderator" })).toEqual({
      error: "@nora already has that role.",
    });
    expect(await grant({ handle: "nora", role: "moderator", categoryId: "999999" })).toEqual({
      error: "That category no longer exists.",
    });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("re-checks under the lock when the target changed after the page loaded", async () => {
    as("su");
    stale.target = { id: ids.su2!, roles: [] }; // sam looked like a member a moment ago
    expect(await grant({ handle: "sam", role: "moderator" })).toEqual(REFUSED);
    expect(await rolesOf(ids.su2!)).toEqual(["superuser"]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("revokeRoleAction", () => {
  it("revokes one grant and refreshes forum pills", async () => {
    as("su");
    expect(await revoke({ handle: "moe", role: "moderator", categoryId: cats.games! })).toEqual({
      ok: "@moe is no longer a moderator for one category.",
    });
    expect(await rolesOf(ids.mod!)).toEqual([]);
    expect(revalidateTag).toHaveBeenCalledWith("forum", "max");
    expect(await revoke({ handle: "moe", role: "moderator", categoryId: cats.games! })).toEqual({
      error: "@moe doesn't have that role.",
    });
  });

  it("lets only the owner revoke a superuser", async () => {
    as("su");
    expect(await revoke({ handle: "sam", role: "superuser" })).toEqual(REFUSED);
    as("owner");
    expect(await revoke({ handle: "sam", role: "superuser" })).toEqual({
      ok: "@sam is no longer a superuser.",
    });
    expect(await rolesOf(ids.su2!)).toEqual([]);
  });

  it("explains invalid input", async () => {
    as("owner");
    expect(await revoke({ handle: "x", role: "moderator" })).toEqual({
      error: "Use 3 to 24 letters, digits or underscores.",
    });
  });
});

describe("banAction and liftBanAction", () => {
  it("lets a superuser ban and unban members and moderators, without revalidating", async () => {
    as("su");
    expect(await ban({ handle: "nora", reason: "spam", days: "7" })).toEqual({
      ok: "@nora is banned.",
    });
    expect(await ban({ handle: "moe", reason: "abuse", days: "" })).toEqual({
      ok: "@moe is banned.",
    });
    expect(await ban({ handle: "nora", reason: "again", days: "" })).toEqual({
      error: "@nora is already banned.",
    });
    expect(await activeBans(ids.nora!)).toBe(1);
    expect(await lift("Nora")).toEqual({ ok: "@Nora's ban is lifted." });
    expect(await lift("nora")).toEqual({ error: "@nora isn't banned." });
    expect(await activeBans(ids.nora!)).toBe(0);
    expect(await logCount()).toBe(3);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("lets only the owner ban a superuser; nobody bans the owner or themselves", async () => {
    as("su");
    expect(await ban({ handle: "sam", reason: "x", days: "" })).toEqual(REFUSED);
    expect(await ban({ handle: "owner", reason: "x", days: "" })).toEqual(REFUSED);
    expect(await ban({ handle: "sue", reason: "x", days: "" })).toEqual(REFUSED);
    expect(await lift("bad_su")).toEqual(REFUSED);
    as("owner");
    expect(await ban({ handle: "owner", reason: "x", days: "" })).toEqual(REFUSED);
    expect(await ban({ handle: "sam", reason: "x", days: "1" })).toEqual({ ok: "@sam is banned." });
    expect(await lift("bad_su")).toEqual({ ok: "@bad_su's ban is lifted." });
  });

  it("refuses members and moderators", async () => {
    for (const who of ["nora", "mod"] as const) {
      as(who);
      expect(await ban({ handle: "owner", reason: "x", days: "" })).toEqual(REFUSED);
      expect(await lift("bad_su")).toEqual(REFUSED);
    }
    expect(await logCount()).toBe(0);
  });

  it("explains invalid input", async () => {
    as("owner");
    expect(await ban({ handle: "nora", reason: "", days: "" })).toEqual({
      error: "Give a reason.",
    });
    expect(await ban({ handle: "nora", reason: "x", days: "2" })).toEqual({
      error: "Pick how long the ban lasts.",
    });
    expect(await lift("")).toEqual({ error: "Use 3 to 24 letters, digits or underscores." });
  });
});
