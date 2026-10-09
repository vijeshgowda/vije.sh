import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fmtDate, noteId } from "./format";
import {
  CONTENT_DIR,
  latestNotes,
  listedPosts,
  parsePost,
  readPosts,
  showDrafts,
  toNoteRows,
  type Post,
} from "./posts";
import { frontmatterSchema, slugSchema } from "./schemas";

const md = (fm: string, body = "Hello.\n") => `---\n${fm}\n---\n${body}`;
const FM = "title: T\ndate: 2026-10-05\nsummary: S\ntags: [Notes]";

const post = (over: Partial<Post>): Post => ({
  slug: "a",
  title: "A",
  date: "2026-01-01",
  summary: "s",
  tags: ["X"],
  visibility: "public",
  draft: false,
  body: "",
  ...over,
});

describe("format", () => {
  it("formats ISO dates without locale data", () => {
    expect(fmtDate("2026-10-05")).toBe("5 Oct 2026");
    expect(fmtDate("2026-09-12")).toBe("12 Sep 2026");
  });

  it("numbers notes so the oldest is AN-001", () => {
    expect(noteId(0, 4)).toBe("AN-004");
    expect(noteId(3, 4)).toBe("AN-001");
  });
});

describe("schemas", () => {
  it("accepts kebab-case slugs only", () => {
    expect(slugSchema.safeParse("quality-per-gb").success).toBe(true);
    for (const bad of ["Quality", "a--b", "-a", "a_b", "../x", ""]) {
      expect(slugSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("applies defaults and rejects unknown or invalid fields", () => {
    const ok = frontmatterSchema.parse({
      title: "T",
      date: "2026-10-05",
      summary: "S",
      tags: ["a"],
    });
    expect(ok).toMatchObject({ visibility: "public", draft: false });
    const base = { title: "T", date: "2026-10-05", summary: "S", tags: ["a"] };
    expect(frontmatterSchema.safeParse({ ...base, date: "5 Oct" }).success).toBe(false);
    expect(frontmatterSchema.safeParse({ ...base, tags: [] }).success).toBe(false);
    expect(frontmatterSchema.safeParse({ ...base, visibility: "private" }).success).toBe(false);
    expect(frontmatterSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("parsePost", () => {
  it("splits frontmatter from the body", () => {
    const p = parsePost("t", md(`${FM}\nupdated: 2026-10-07`, "# Hi\n"));
    expect(p).toMatchObject({ slug: "t", title: "T", tags: ["Notes"], updated: "2026-10-07" });
    expect(p.body).toBe("# Hi\n");
  });

  it("handles CRLF line endings", () => {
    expect(parsePost("t", md(FM).replace(/\n/g, "\r\n")).title).toBe("T");
  });

  it("fails with the post path for every kind of bad input", () => {
    expect(() => parsePost("Bad_Slug", md(FM))).toThrow(/content\/blog\/Bad_Slug: folder name/);
    expect(() => parsePost("t", "no frontmatter")).toThrow(/missing --- frontmatter/);
    expect(() => parsePost("t", md("title: [unclosed"))).toThrow(/not valid YAML/);
    expect(() => parsePost("t", md("title: T"))).toThrow(/invalid frontmatter: date/);
    expect(() => parsePost("t", md(""))).toThrow(/invalid frontmatter/);
  });
});

describe("readPosts", () => {
  const dirs: string[] = [];
  const tmp = (files: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-"));
    dirs.push(dir);
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), text);
    }
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("reads index.md and index.mdx folders and ignores loose files", () => {
    const dir = tmp({ "a/index.md": md(FM), "b/index.mdx": md(FM), "README.md": "x" });
    expect(
      readPosts(dir)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("returns nothing when the folder is missing", () => {
    expect(readPosts(path.join(os.tmpdir(), "no-such-blog-dir"))).toEqual([]);
  });

  it("requires exactly one index file per post", () => {
    expect(() => readPosts(tmp({ "a/other.md": "x" }))).toThrow(/content\/blog\/a: needs exactly/);
    expect(() => readPosts(tmp({ "a/index.md": md(FM), "a/index.mdx": md(FM) }))).toThrow(
      /needs exactly/,
    );
  });

  it("latestNotes hides drafts in production only", () => {
    const dir = tmp({
      "old/index.md": md(FM.replace("2026-10-05", "2026-01-01")),
      "new/index.md": md(`${FM}\ndraft: true`),
    });
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(latestNotes(3, dir).map((n) => n.slug)).toEqual(["new", "old"]);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(latestNotes(3, dir)).toEqual([
      {
        id: "AN-001",
        slug: "old",
        title: "T",
        summary: "S",
        category: "Notes",
        date: "2026-01-01",
      },
    ]);
  });

  it("the repo's own posts are valid", () => {
    expect(() => readPosts(CONTENT_DIR)).not.toThrow();
  });
});

describe("listing", () => {
  it("shows drafts everywhere except Vercel production", () => {
    expect(showDrafts({})).toBe(true);
    expect(showDrafts({ VERCEL_ENV: "preview" })).toBe(true);
    expect(showDrafts({ VERCEL_ENV: "production" })).toBe(false);
  });

  it("sorts newest first, drops unlisted posts and drafts on request", () => {
    const posts = [
      post({ slug: "b", date: "2026-02-01" }),
      post({ slug: "a", date: "2026-02-01" }),
      post({ slug: "c", date: "2026-03-01", draft: true }),
      post({ slug: "u", date: "2026-04-01", visibility: "unlisted" }),
      post({ slug: "o", date: "2026-01-01" }),
    ];
    const slugs = (drafts: boolean) => listedPosts(posts, { drafts }).map((p) => p.slug);
    expect(slugs(true)).toEqual(["c", "a", "b", "o"]);
    expect(slugs(false)).toEqual(["a", "b", "o"]);
  });

  it("maps posts to rows with ids and the first tag as category", () => {
    const rows = toNoteRows([post({ slug: "n", tags: ["Games", "x"] }), post({ slug: "o" })]);
    expect(rows.map((r) => [r.id, r.category])).toEqual([
      ["AN-002", "Games"],
      ["AN-001", "X"],
    ]);
  });
});
