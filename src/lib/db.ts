import "server-only";
import * as pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { env } from "@/lib/env";

/**
 * The only database connection path (docs/database.md section 8). Supabase transaction pooler
 * (port 6543), one connection per serverless instance, verified TLS. Never pass a query `name`
 * (named prepared statements break on the pooler) and never rely on session state.
 * Import this only from features/<x>/queries.ts and mutations.ts.
 */
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const { DATABASE_URL, DATABASE_CA_CERT } = env("database");
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_CA_CERT ? { ca: DATABASE_CA_CERT } : false, // env() only allows no CA on localhost
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
  attachDatabasePool(pool);
  return pool;
}

export async function query<R extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  return getPool().query<R>(sql, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
