import type * as pg from "pg";

type Db = typeof import("@/lib/db");

/**
 * A `vi.mock("@/lib/db", ...)` factory that runs every query and transaction as the app's role
 * (`set local role app_rw`, database.md section 3), so a missing grant or an owner-guard trigger
 * fails the test the way it would in production:
 *
 *   vi.mock("@/lib/db", async (orig) => asAppRw(await orig()));
 */
export function asAppRw(db: Db): Db {
  const withTransaction = <T>(fn: (client: pg.PoolClient) => Promise<T>) =>
    db.withTransaction(async (client) => {
      await client.query("set local role app_rw");
      return fn(client);
    });
  const query = <R extends pg.QueryResultRow>(sql: string, params: unknown[] = []) =>
    withTransaction((client) => client.query<R>(sql, params));
  return { ...db, withTransaction, query };
}
