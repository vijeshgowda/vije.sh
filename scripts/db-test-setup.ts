/**
 * Rebuilds the local test database: Supabase stand-ins, every migration in order, then the seed.
 * Also proves the migrations apply to an empty database. Usage: npm run db:test:setup
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { testClient } from "../tests/helpers/db";

async function main() {
  const client = testClient();
  await client.connect();
  try {
    await client.query("drop schema if exists app cascade; drop schema if exists auth cascade;");
    await client.query(readFileSync("tests/db/bootstrap.sql", "utf8"));
    const dir = "supabase/migrations";
    const files = readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();
    for (const f of files) {
      await client.query(readFileSync(join(dir, f), "utf8"));
      console.log(`applied ${f}`);
    }
    await client.query(readFileSync("supabase/seed.sql", "utf8"));
    console.log("seeded");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
