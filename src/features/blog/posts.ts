import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { noteId } from "./format";
import { frontmatterSchema, slugSchema, type Frontmatter } from "./schemas";

/** Git posts (application.md 9): content/blog/<slug>/index.md, or index.mdx when a post needs a component. */

export const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export type Post = Frontmatter & { slug: string; body: string };

/** One row of an application-notes list (overview section 5, blog index). */
export type NoteRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  date: string;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const INDEX_FILES = ["index.md", "index.mdx"];

export function parsePost(slug: string, source: string): Post {
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`content/blog/${slug}: ${msg}`);
  };
  const s = slugSchema.safeParse(slug);
  if (!s.success) fail(`folder name ${s.error.issues[0].message}`);
  const m = FRONTMATTER.exec(source) ?? fail("missing --- frontmatter --- block at the top");
  let raw: unknown;
  try {
    raw = parseYaml(m[1]);
  } catch (e) {
    fail(`frontmatter is not valid YAML: ${(e as Error).message}`);
  }
  const fm = frontmatterSchema.safeParse(raw ?? {});
  if (!fm.success) {
    fail(
      `invalid frontmatter: ${fm.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
    );
  }
  return { ...fm.data, slug, body: source.slice(m[0].length) };
}

/**
 * Reads every post synchronously, so prerendering includes them without a cache boundary.
 * next.config.ts traces content/blog explicitly, so the fs calls opt out of Turbopack's tracing.
 */
export function readPosts(dir = CONTENT_DIR): Post[] {
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const found = INDEX_FILES.filter((f) =>
        fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, e.name, f)),
      );
      if (found.length !== 1) {
        throw new Error(`content/blog/${e.name}: needs exactly one of ${INDEX_FILES.join(", ")}`);
      }
      const file = path.join(/*turbopackIgnore: true*/ dir, e.name, found[0]);
      return parsePost(e.name, fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
    });
}

/** Drafts show locally and on preview deploys, never in production (application.md 9.2). */
export function showDrafts(source: Record<string, string | undefined> = process.env): boolean {
  return source.VERCEL_ENV !== "production";
}

/** Posts that appear in lists, newest first. Unlisted posts are reachable by URL only. */
export function listedPosts(posts: Post[], { drafts }: { drafts: boolean }): Post[] {
  return posts
    .filter((p) => p.visibility === "public" && (drafts || !p.draft))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function toNoteRows(posts: Post[]): NoteRow[] {
  return posts.map((p, i) => ({
    id: noteId(i, posts.length),
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    category: p.tags[0],
    date: p.date,
  }));
}

export function listedNotes(dir = CONTENT_DIR): NoteRow[] {
  return toNoteRows(listedPosts(readPosts(dir), { drafts: showDrafts() }));
}

export function latestNotes(count: number, dir = CONTENT_DIR): NoteRow[] {
  return listedNotes(dir).slice(0, count);
}

/** Every post with a page: listed and unlisted, drafts only where they show. */
export function publishedPosts(dir = CONTENT_DIR): Post[] {
  const drafts = showDrafts();
  return readPosts(dir).filter((p) => drafts || !p.draft);
}

export type PostEntry = {
  post: Post;
  /** AN number; null for unlisted posts, which stay out of the numbering */
  id: string | null;
  newer?: NoteRow;
  older?: NoteRow;
};

export function getPost(slug: string, dir = CONTENT_DIR): PostEntry | null {
  const drafts = showDrafts();
  const posts = readPosts(dir);
  const post = posts.find((p) => p.slug === slug && (drafts || !p.draft));
  if (!post) return null;
  const rows = toNoteRows(listedPosts(posts, { drafts }));
  const i = rows.findIndex((r) => r.slug === slug);
  if (i < 0) return { post, id: null };
  return { post, id: rows[i].id, newer: rows[i - 1], older: rows[i + 1] };
}
