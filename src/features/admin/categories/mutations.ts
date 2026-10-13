import "server-only";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { categoryIdSchema, type CategoryDetails, type Move, type NewCategory } from "./schemas";

/**
 * Category writes for the owner-only Server Actions. Each runs in one transaction with its
 * `moderation_log` row (`category_create` / `category_update` / `category_delete`; the log has no
 * category column, so the note names the slug) and returns the slug the caller must revalidate
 * (`FORUM_TAG` and `categoryTag(slug)`), or null when the category doesn't exist. Slugs never
 * change: they are the forum's URLs.
 */

export class CategorySlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`another category already uses "${slug}"`);
    this.name = "CategorySlugTakenError";
  }
}

const UNIQUE_VIOLATION = "23505";

type LogAction = "category_create" | "category_update" | "category_delete";

async function log(client: PoolClient, actorId: string, action: LogAction, note: string) {
  await client.query(
    `insert into app.moderation_log (actor_id, action, note) values ($1, $2, $3)`,
    [actorId, action, note],
  );
}

const validId = (id: string) => categoryIdSchema.safeParse(id).success;

interface Locked {
  slug: string;
  name: string;
  description: string | null;
  staff_only: boolean;
}

/** Locks one category for the rest of the transaction (threads can still reference it). */
async function lock(client: PoolClient, id: string): Promise<Locked | null> {
  const { rows } = await client.query<Locked>(
    `select slug, name, description, staff_only from app.categories where id = $1
       for no key update`,
    [id],
  );
  return rows[0] ?? null;
}

/** Adds a category at the end of the list. */
export async function createCategory(
  actorId: string,
  input: NewCategory,
): Promise<{ id: string; slug: string }> {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; slug: string }>(
        `insert into app.categories (slug, name, description, staff_only, position)
         values ($1, $2, $3, $4, (select coalesce(max(position) + 1, 0) from app.categories))
         returning id::text as id, slug`,
        [input.slug, input.name, input.description, input.staffOnly],
      );
      const created = rows[0]!;
      await log(
        client,
        actorId,
        "category_create",
        `Created /forum/${created.slug} "${input.name}"${input.staffOnly ? " (staff only)" : ""}`,
      );
      return created;
    });
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new CategorySlugTakenError(input.slug);
    }
    throw err;
  }
}

/** Renames a category or edits its description. Unchanged details write nothing. */
export async function updateCategory(
  actorId: string,
  id: string,
  details: CategoryDetails,
): Promise<{ slug: string; changed: boolean } | null> {
  if (!validId(id)) return null;
  return withTransaction(async (client) => {
    const before = await lock(client, id);
    if (!before) return null;
    const changes: string[] = [];
    if (before.name !== details.name) changes.push(`renamed "${before.name}" to "${details.name}"`);
    if (before.description !== details.description) changes.push("edited the description");
    if (changes.length === 0) return { slug: before.slug, changed: false };
    await client.query(`update app.categories set name = $2, description = $3 where id = $1`, [
      id,
      details.name,
      details.description,
    ]);
    await log(client, actorId, "category_update", `/forum/${before.slug}: ${changes.join(", ")}`);
    return { slug: before.slug, changed: true };
  });
}

/**
 * Moves a category one place up or down in the forum order. Positions are renumbered 0..n-1 in
 * the current order first, so ties and gaps (seeded or hand-edited rows) can't stall a move.
 */
export async function moveCategory(
  actorId: string,
  id: string,
  move: Move,
): Promise<{ slug: string; moved: boolean } | null> {
  if (!validId(id)) return null;
  return withTransaction(async (client) => {
    // every row is locked, so two moves at once can't interleave their renumbering
    const { rows } = await client.query<{ id: string; slug: string; name: string }>(
      `select id::text as id, slug, name from app.categories
        order by position, name, id
          for no key update`,
    );
    const from = rows.findIndex((r) => r.id === id);
    if (from === -1) return null;
    const row = rows[from]!;
    const to = move === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= rows.length) return { slug: row.slug, moved: false };
    [rows[from], rows[to]] = [rows[to]!, row];
    await client.query(
      `update app.categories c set position = o.ord - 1
         from unnest($1::bigint[]) with ordinality as o(id, ord)
        where c.id = o.id and c.position <> o.ord - 1`,
      [rows.map((r) => r.id)],
    );
    await log(client, actorId, "category_update", `/forum/${row.slug}: moved ${move}`);
    return { slug: row.slug, moved: true };
  });
}

/**
 * Sets whether only staff may start threads in a category. Everyone can still read it
 * (database.md: `staff_only` limits who posts, not who reads).
 */
export async function setCategoryStaffOnly(
  actorId: string,
  id: string,
  staffOnly: boolean,
): Promise<{ slug: string; changed: boolean } | null> {
  if (!validId(id)) return null;
  return withTransaction(async (client) => {
    const before = await lock(client, id);
    if (!before) return null;
    if (before.staff_only === staffOnly) return { slug: before.slug, changed: false };
    await client.query(`update app.categories set staff_only = $2 where id = $1`, [id, staffOnly]);
    await log(
      client,
      actorId,
      "category_update",
      `/forum/${before.slug}: ${staffOnly ? "only staff start threads" : "everyone starts threads"}`,
    );
    return { slug: before.slug, changed: true };
  });
}

export type DeleteCategoryResult =
  { status: "deleted"; slug: string } | { status: "not-empty"; slug: string };

/**
 * Deletes a category that has no threads, hidden ones included. The check and the delete happen
 * in the database inside one transaction: the row is locked first, which makes a concurrent new
 * thread wait (its foreign key needs the row) and then fail, and the delete itself repeats the
 * check (the foreign key from app.threads refuses it as a last resort). Category moderator grants
 * go with it (`on delete cascade`); the log note counts them.
 */
export async function deleteCategory(
  actorId: string,
  id: string,
): Promise<DeleteCategoryResult | null> {
  if (!validId(id)) return null;
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      slug: string;
      name: string;
      threads: number;
      moderators: number;
    }>(
      `select c.slug, c.name,
              (select count(*)::int from app.threads t where t.category_id = c.id) as threads,
              (select count(*)::int from app.user_roles r where r.category_id = c.id) as moderators
         from app.categories c
        where c.id = $1
          for update of c`,
      [id],
    );
    const found = rows[0];
    if (!found) return null;
    if (found.threads > 0) return { status: "not-empty", slug: found.slug };
    const { rowCount } = await client.query(
      `delete from app.categories c
        where c.id = $1 and not exists (select 1 from app.threads t where t.category_id = c.id)`,
      [id],
    );
    // a thread added while this waited for the lock: the delete's own check saw it
    if (rowCount !== 1) return { status: "not-empty", slug: found.slug };
    const grants =
      found.moderators > 0
        ? `; removed ${found.moderators} category moderator grant${found.moderators === 1 ? "" : "s"}`
        : "";
    await log(
      client,
      actorId,
      "category_delete",
      `Deleted /forum/${found.slug} "${found.name}"${grants}`,
    );
    return { status: "deleted", slug: found.slug };
  });
}
