import type * as pg from "pg";

/** A role grant for insertUser(); a moderator may be scoped to one category (by slug). */
export type UserGrant = "admin" | "superuser" | "moderator" | { moderator: string };

export interface UserOpts {
  displayName?: string | null;
  onboarded?: boolean;
  /** Postgres interval ago, e.g. "10 days"; default now */
  age?: string;
  roles?: UserGrant[];
}

/** Inserts auth.users + app.profiles (+ roles) as the table owner; returns the profile id. */
export async function insertUser(
  db: pg.Client,
  handle: string,
  { displayName = null, onboarded = true, age = "0 seconds", roles = [] }: UserOpts = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`${handle.toLowerCase()}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query(
    `insert into app.profiles (id, handle, display_name, onboarded_at, created_at)
     values ($1, $2, $3, case when $4 then now() end, now() - $5::interval)`,
    [id, handle, displayName, onboarded, age],
  );
  for (const r of roles) {
    const [role, slug] = typeof r === "string" ? [r, null] : ["moderator", r.moderator];
    await db.query(
      `insert into app.user_roles (user_id, role, category_id)
       values ($1, $2, (select id from app.categories where slug = $3))`,
      [id, role, slug],
    );
  }
  return id;
}

/** The seeded category ids by slug. */
export async function categoryIds(db: pg.Client): Promise<Record<string, string>> {
  const { rows } = await db.query<{ id: string; slug: string }>(
    "select id::text as id, slug from app.categories order by position, name",
  );
  return Object.fromEntries(rows.map((r) => [r.slug, r.id]));
}
