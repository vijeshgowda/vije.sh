import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type * as pg from "pg";
import { testClient, testDatabaseUrl, truncateApp } from "../../../../tests/helpers/db";

// The app's writes run as app_rw (production grants, tests/db/bootstrap.sql), so a missing grant
// fails here: every connection of @/lib/db's pool switches role as it connects.
const url = new URL(testDatabaseUrl());
url.searchParams.set("options", "-c role=app_rw");
process.env.DATABASE_URL = url.toString();

const { getPool } = await import("@/lib/db");
const q = await import("./queries");
const m = await import("./mutations");
const { newCategorySchema } = await import("./schemas");

let db: pg.Client;
let owner: string;

const SEED = ["announcements", "engineering", "local-ai", "games", "off-topic"];

beforeAll(async () => {
  db = testClient();
  await db.connect();
});
afterAll(async () => {
  await truncateApp(db);
  await resetCategories();
  await db.end();
  await getPool().end();
});
beforeEach(async () => {
  await truncateApp(db);
  await resetCategories();
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ('owner@example.test') returning id",
  );
  owner = rows[0]!.id;
  await db.query(
    "insert into app.profiles (id, handle, onboarded_at) values ($1, 'owner', now())",
    [owner],
  );
});

/** Back to the five seeded categories as supabase/seed.sql writes them. */
async function resetCategories() {
  await db.query("delete from app.categories where not (slug = any($1))", [SEED]);
  await db.query(
    `update app.categories c
        set name = s.name, description = s.description, position = s.position,
            staff_only = s.staff_only
       from (values
         ('announcements', 'Announcements', 'News about the site.', 0, true),
         ('engineering', 'Engineering', 'Backend, infrastructure, tooling.', 1, false),
         ('local-ai', 'Local AI', 'Small models on your own hardware.', 2, false),
         ('games', 'Games', 'Saltbound and other projects.', 3, false),
         ('off-topic', 'Off-topic', 'Everything else.', 4, false)
       ) as s(slug, name, description, position, staff_only)
      where c.slug = s.slug`,
  );
}

const slugs = async () => (await q.listCategoriesForAdmin()).map((c) => c.slug);
const idOf = async (slug: string) =>
  (
    await db.query<{ id: string }>("select id::text as id from app.categories where slug = $1", [
      slug,
    ])
  ).rows[0]!.id;
const logRows = async () =>
  (
    await db.query<{ action: string; note: string; actor_id: string }>(
      "select action, note, actor_id from app.moderation_log order by id",
    )
  ).rows;
const input = (over: Record<string, unknown> = {}) =>
  newCategorySchema.parse({ slug: "hardware", name: "Hardware", ...over });

async function thread(slug: string, hidden = false) {
  await db.query(
    `insert into app.threads (category_id, author_id, title, body_md, hidden_at)
     values ((select id from app.categories where slug = $1), $2, 'A thread', 'Body', $3)`,
    [slug, owner, hidden ? new Date() : null],
  );
}

describe("listing categories for the owner", () => {
  it("returns every category in forum order with thread and moderator counts", async () => {
    await thread("games");
    await thread("games", true);
    await db.query(
      `insert into app.user_roles (user_id, role, category_id)
       values ($1, 'moderator', (select id from app.categories where slug = 'games'))`,
      [owner],
    );
    const list = await q.listCategoriesForAdmin();
    expect(list.map((c) => c.slug)).toEqual(SEED);
    expect(list.find((c) => c.slug === "games")).toMatchObject({
      id: expect.stringMatching(/^\d+$/),
      name: "Games",
      staffOnly: false,
      threadCount: 2,
      moderatorCount: 1,
    });
    expect(list[0]).toMatchObject({ slug: "announcements", staffOnly: true, threadCount: 0 });
  });
});

describe("category mutations (as app_rw)", () => {
  it("runs as the app's role", async () => {
    const { rows } = await getPool().query<{ role: string }>("select current_user as role");
    expect(rows[0]!.role).toBe("app_rw");
  });

  it("creates a category at the end and logs it", async () => {
    const created = await m.createCategory(owner, input({ staffOnly: true, description: "Kit" }));
    expect(created).toEqual({ id: expect.stringMatching(/^\d+$/), slug: "hardware" });
    expect(await slugs()).toEqual([...SEED, "hardware"]);
    expect((await q.listCategoriesForAdmin()).at(-1)).toMatchObject({
      name: "Hardware",
      description: "Kit",
      staffOnly: true,
    });
    expect(await logRows()).toEqual([
      {
        action: "category_create",
        note: 'Created /forum/hardware "Hardware" (staff only)',
        actor_id: owner,
      },
    ]);
  });

  it("refuses a slug that exists, without a log row", async () => {
    await expect(m.createCategory(owner, input({ slug: "games" }))).rejects.toBeInstanceOf(
      m.CategorySlugTakenError,
    );
    expect(await logRows()).toEqual([]);
  });

  it("renames and edits the description, never the slug, logging only real changes", async () => {
    const id = await idOf("games");
    expect(await m.updateCategory(owner, id, { name: "Gaming", description: "All games" })).toEqual(
      { slug: "games", changed: true },
    );
    expect(await m.updateCategory(owner, id, { name: "Gaming", description: "All games" })).toEqual(
      { slug: "games", changed: false },
    );
    expect(await m.updateCategory(owner, id, { name: "Gaming", description: null })).toEqual({
      slug: "games",
      changed: true,
    });
    const games = (await q.listCategoriesForAdmin()).find((c) => c.id === id);
    expect(games).toMatchObject({ slug: "games", name: "Gaming", description: null });
    expect((await logRows()).map((r) => [r.action, r.note])).toEqual([
      ["category_update", '/forum/games: renamed "Games" to "Gaming", edited the description'],
      ["category_update", "/forum/games: edited the description"],
    ]);
  });

  it("moves categories one place, renumbering ties and gaps", async () => {
    // a tie and a gap, as hand-edited rows might leave them
    await db.query(
      "update app.categories set position = case slug when 'games' then 1 when 'off-topic' then 9 else position end",
    );
    expect(await slugs()).toEqual([
      "announcements",
      "engineering",
      "games",
      "local-ai",
      "off-topic",
    ]);
    expect(await m.moveCategory(owner, await idOf("local-ai"), "up")).toEqual({
      slug: "local-ai",
      moved: true,
    });
    expect(await slugs()).toEqual([
      "announcements",
      "engineering",
      "local-ai",
      "games",
      "off-topic",
    ]);
    const { rows } = await db.query<{ position: number }>(
      "select position from app.categories order by position",
    );
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    expect(await m.moveCategory(owner, await idOf("announcements"), "down")).toEqual({
      slug: "announcements",
      moved: true,
    });
    expect((await slugs())[0]).toBe("engineering");
    expect((await logRows()).map((r) => r.note)).toEqual([
      "/forum/local-ai: moved up",
      "/forum/announcements: moved down",
    ]);
  });

  it("leaves the ends alone and ignores unknown ids", async () => {
    expect(await m.moveCategory(owner, await idOf("announcements"), "up")).toEqual({
      slug: "announcements",
      moved: false,
    });
    expect(await m.moveCategory(owner, await idOf("off-topic"), "down")).toEqual({
      slug: "off-topic",
      moved: false,
    });
    expect(await m.moveCategory(owner, "999999", "up")).toBeNull();
    expect(await m.moveCategory(owner, "nope", "up")).toBeNull();
    expect(await slugs()).toEqual(SEED);
    expect(await logRows()).toEqual([]);
  });

  it("toggles staff-only posting and logs each change", async () => {
    const id = await idOf("games");
    expect(await m.setCategoryStaffOnly(owner, id, true)).toEqual({ slug: "games", changed: true });
    expect(await m.setCategoryStaffOnly(owner, id, true)).toEqual({
      slug: "games",
      changed: false,
    });
    expect(await m.setCategoryStaffOnly(owner, id, false)).toEqual({
      slug: "games",
      changed: true,
    });
    expect((await logRows()).map((r) => r.note)).toEqual([
      "/forum/games: only staff start threads",
      "/forum/games: everyone starts threads",
    ]);
  });

  it("deletes an empty category with its moderator grants and logs it", async () => {
    const { id } = await m.createCategory(owner, input());
    await db.query(
      "insert into app.user_roles (user_id, role, category_id) values ($1, 'moderator', $2)",
      [owner, id],
    );
    expect(await m.deleteCategory(owner, id)).toEqual({ status: "deleted", slug: "hardware" });
    expect(await slugs()).toEqual(SEED);
    expect((await db.query("select 1 from app.user_roles")).rowCount).toBe(0);
    expect((await logRows()).map((r) => [r.action, r.note])).toEqual([
      ["category_create", 'Created /forum/hardware "Hardware"'],
      ["category_delete", 'Deleted /forum/hardware "Hardware"; removed 1 category moderator grant'],
    ]);
  });

  it("refuses to delete a category with any thread, hidden ones included", async () => {
    await thread("games", true);
    expect(await m.deleteCategory(owner, await idOf("games"))).toEqual({
      status: "not-empty",
      slug: "games",
    });
    expect(await slugs()).toEqual(SEED);
    expect(await logRows()).toEqual([]);
  });

  it("refuses a delete when a thread arrives while it waits for the lock", async () => {
    const { id } = await m.createCategory(owner, input());
    // another transaction is adding a thread: it holds a key-share lock on the category row
    await db.query("begin");
    await db.query(
      `insert into app.threads (category_id, author_id, title, body_md)
       values ($1, $2, 'Racing thread', 'Body')`,
      [id, owner],
    );
    const pending = m.deleteCategory(owner, id);
    await new Promise((r) => setTimeout(r, 200));
    await db.query("commit");
    expect(await pending).toEqual({ status: "not-empty", slug: "hardware" });
    expect((await logRows()).map((r) => r.action)).toEqual(["category_create"]);
    await db.query("delete from app.threads");
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await m.updateCategory(owner, "999999", { name: "X", description: null })).toBeNull();
    expect(await m.updateCategory(owner, "x", { name: "X", description: null })).toBeNull();
    expect(await m.setCategoryStaffOnly(owner, "999999", true)).toBeNull();
    expect(await m.setCategoryStaffOnly(owner, "-1", true)).toBeNull();
    expect(await m.deleteCategory(owner, "999999")).toBeNull();
    expect(await m.deleteCategory(owner, "0")).toBeNull();
    expect(await logRows()).toEqual([]);
  });
});
