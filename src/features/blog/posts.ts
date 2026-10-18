import "server-only";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { newestFirst, noteId } from "./format";
import { frontmatterSchema, parseFolders, slugSchema, type Frontmatter } from "./schemas";

/**
 * Git posts (application.md 9): content/blog/NNNN-<slug>/index.md, or index.mdx when a post needs
 * a component. NNNN is the publish order; the URL is /blog/<slug>.
 */

export const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export type Post = Frontmatter & { slug: string; body: string; seq?: number };

/** A post read from content/blog: `folder` is NNNN-<slug>, `seq` its publish number. */
export type GitPost = Post & { seq: number; folder: string };

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

export function parsePost(slug: string, source: string, folder = slug): Post {
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`content/blog/${folder}: ${msg}`);
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
 * BLOG_ONLY (comma-separated slugs, without the NNNN- prefix) limits git posts to a fixed set. Playwright and the CI
 * e2e build set it from tests/e2e/blog-posts.json, so adding a post never changes what the
 * feature tests see. Unset (dev, Vercel, unit tests) means every post.
 */
export function onlySlugs(source: Record<string, string | undefined> = process.env) {
  const slugs = (source.BLOG_ONLY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return slugs.length ? new Set(slugs) : null;
}

/**
 * Reads every post synchronously, so prerendering includes them without a cache boundary.
 * next.config.ts traces content/blog explicitly, so the fs calls opt out of Turbopack's tracing.
 */
export function readPosts(dir = CONTENT_DIR): GitPost[] {
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  const entries = parseFolders(
    fs
      .readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );
  const only = onlySlugs();
  if (only) {
    const missing = [...only].filter((s) => !entries.some((e) => e.slug === s));
    if (missing.length) {
      throw new Error(`BLOG_ONLY names posts that aren't in content/blog: ${missing.join(", ")}`);
    }
  }
  return entries
    .filter((e) => !only || only.has(e.slug))
    .map(({ folder, seq, slug }) => {
      const found = INDEX_FILES.filter((f) =>
        fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, folder, f)),
      );
      if (found.length !== 1) {
        throw new Error(`content/blog/${folder}: needs exactly one of ${INDEX_FILES.join(", ")}`);
      }
      const file = path.join(/*turbopackIgnore: true*/ dir, folder, found[0]);
      const source = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8");
      return { ...parsePost(slug, source, folder), seq, folder };
    });
}

/** Drafts show locally and on preview deploys, never in production (application.md 9.2). */
export function showDrafts(source: Record<string, string | undefined> = process.env): boolean {
  return source.VERCEL_ENV !== "production";
}

/** Posts that appear in lists, newest first. Unlisted posts are reachable by URL only. */
export function listedPosts<P extends Post>(posts: P[], { drafts }: { drafts: boolean }): P[] {
  return posts.filter((p) => p.visibility === "public" && (drafts || !p.draft)).sort(newestFirst);
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
export function publishedPosts(dir = CONTENT_DIR): GitPost[] {
  const drafts = showDrafts();
  return readPosts(dir).filter((p) => drafts || !p.draft);
}

export type PostEntry<P extends Post = Post> = {
  post: P;
  /** AN number; null for unlisted posts, which stay out of the numbering */
  id: string | null;
  newer?: NoteRow;
  older?: NoteRow;
};

/** A post's number and neighbours in a numbered list; unlisted posts aren't in it. */
export function entryFor<P extends Post>(post: P, rows: NoteRow[]): PostEntry<P> {
  const i = rows.findIndex((r) => r.slug === post.slug);
  if (i < 0) return { post, id: null };
  return { post, id: rows[i].id, newer: rows[i - 1], older: rows[i + 1] };
}

/** A git post with its place among git posts only (server/catalog.ts adds database notes). */
export function getPost(slug: string, dir = CONTENT_DIR): PostEntry<GitPost> | null {
  const drafts = showDrafts();
  const posts = readPosts(dir);
  const post = posts.find((p) => p.slug === slug && (drafts || !p.draft));
  if (!post) return null;
  return entryFor(post, toNoteRows(listedPosts(posts, { drafts })));
}
