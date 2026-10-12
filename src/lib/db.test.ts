import { beforeEach, describe, expect, it, vi } from "vitest";

const client = {
  query: vi.fn<(sql: string) => Promise<unknown>>(),
  release: vi.fn<(err?: Error) => void>(),
};

vi.mock("pg", () => ({
  Pool: class {
    connect = async () => client;
  },
}));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));

process.env.DATABASE_URL = "postgres://localhost/test";
const { withTransaction } = await import("./db");

beforeEach(() => {
  client.query.mockReset().mockResolvedValue({ rows: [] });
  client.release.mockReset();
});

const sqls = () => client.query.mock.calls.map(([sql]) => sql);

describe("withTransaction", () => {
  it("commits and returns the connection to the pool", async () => {
    await expect(withTransaction(async (c) => (await c.query("select 1"), "ok"))).resolves.toBe(
      "ok",
    );
    expect(sqls()).toEqual(["begin", "select 1", "commit"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back, rethrows and keeps a healthy connection", async () => {
    const boom = new Error("constraint");
    await expect(withTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(sqls()).toEqual(["begin", "rollback"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("keeps the original error and discards the connection when the rollback fails", async () => {
    const boom = new Error("network");
    client.query.mockImplementation(async (sql) => {
      if (sql === "rollback") throw new Error("connection terminated");
      return { rows: [] };
    });
    await expect(withTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(client.release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
