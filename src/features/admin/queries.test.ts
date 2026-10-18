import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...args: unknown[]) => query(...args) }));
const { loadAdminStats } = await import("./queries");

let dir: string;
let seq = 0;
const post = (slug: string, extra = "") => {
  const folder = path.join(dir, `${String(++seq).padStart(4, "0")}-${slug}`);
  fs.mkdirSync(folder);
  fs.writeFileSync(
    path.join(folder, "index.md"),
    `---\ntitle: ${slug}\ndate: 2026-01-01\nsummary: s\ntags: [t]\n${extra}---\nBody\n`,
  );
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-stats-"));
  post("listed");
  post("hidden", "visibility: unlisted\n");
  post("wip", "draft: true\n");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

function counts(notes: number) {
  query.mockReset();
  query
    .mockResolvedValueOnce({
      rows: [
        {
          members: 0,
          onboarded: 0,
          new_7d: 0,
          new_30d: 0,
          threads: 0,
          replies: 0,
          open_reports: 0,
          active_bans: 0,
          notes,
          database_bytes: "1024",
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [] });
}

describe("loadAdminStats() notes", () => {
  it("counts git posts listed on /blog next to every database note", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    counts(5);
    expect((await loadAdminStats(dir)).notes).toEqual({ git: 1, db: 5 });
  });

  it("counts drafts where the blog shows them (local, previews)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    counts(0);
    expect((await loadAdminStats(dir)).notes).toEqual({ git: 2, db: 0 });
  });

  it("counts no git posts when there is no content folder", async () => {
    counts(2);
    expect((await loadAdminStats(path.join(dir, "missing"))).notes).toEqual({ git: 0, db: 2 });
  });
});
