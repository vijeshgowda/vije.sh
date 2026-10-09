import { afterAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../../../tests/helpers/db";

// db.ts reads DATABASE_URL; point it at the local test database (no TLS on localhost).
process.env.DATABASE_URL = testDatabaseUrl();

const { getPool, query, withTransaction } = await import("@/lib/db");
const { ping } = await import("./queries");

afterAll(async () => {
  await getPool().end();
});

describe("system queries", () => {
  it("ping() counts categories through the shared pool", async () => {
    expect(await ping()).toBeGreaterThanOrEqual(5);
    expect(getPool()).toBe(getPool());
  });

  it("withTransaction() commits and rolls back", async () => {
    expect(await withTransaction(async (c) => (await c.query("select 1 as n")).rows[0].n)).toBe(1);
    await expect(
      withTransaction(async (c) => {
        await c.query("update app.categories set name = 'changed' where slug = 'games'");
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    const { rows } = await query<{ name: string }>(
      "select name from app.categories where slug = 'games'",
    );
    expect(rows[0]!.name).toBe("Games");
  });
});
