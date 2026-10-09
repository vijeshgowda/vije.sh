import { existsSync } from "node:fs";
import * as pg from "pg";

/** Loads .env.test when present (Node's built-in parser), without overriding real env vars. */
export function loadTestEnv() {
  if (existsSync(".env.test")) process.loadEnvFile(".env.test");
}

/**
 * Integration tests truncate tables, so they must never reach a real Supabase project. Refuses any
 * database URL whose host isn't localhost or 127.0.0.1.
 */
export function testDatabaseUrl(): string {
  loadTestEnv();
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set (see .env.test.example)");
  const host = new URL(raw).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing to use a non-local test database (host "${host}")`);
  }
  return raw;
}

export function testClient(): pg.Client {
  return new pg.Client({ connectionString: testDatabaseUrl() });
}

const APP_TABLES = [
  "notifications",
  "moderation_log",
  "reports",
  "replies",
  "threads",
  "posts",
  "user_bans",
  "user_roles",
  "images",
  "profiles",
] as const;

/** Clears app data between tests; categories (seed) are kept. */
export async function truncateApp(client: pg.Client) {
  await client.query(
    `truncate ${APP_TABLES.map((t) => `app.${t}`).join(", ")} restart identity cascade`,
  );
  await client.query("truncate auth.users cascade");
}
