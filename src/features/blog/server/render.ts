import "server-only";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import { renderMarkdown } from "@/lib/markdown";
import { noteTag, NOTES_TAG } from "../notes/tags";
import { CONTENT_DIR, getPost } from "../posts";
import { rehypePostAssets } from "../rehype-post";

/** A git post's body as React elements. Cached for good: git posts only change with a deploy. */
export async function renderPostBody(slug: string) {
  "use cache";
  cacheLife("max");
  const entry = getPost(slug);
  if (!entry) return null;
  const dir = path.join(CONTENT_DIR, slug);
  return renderMarkdown(entry.post.body, { plugins: [[rehypePostAssets, { slug, dir }]] });
}

/**
 * A database note's body, through the sanitised pipeline (no raw HTML, user-content- id prefix,
 * nofollow links). Keyed by the Markdown itself, so an edit never serves the old rendering.
 */
export async function renderNoteBody(slug: string, bodyMd: string) {
  "use cache";
  cacheLife("max");
  cacheTag(NOTES_TAG, noteTag(slug));
  return renderMarkdown(bodyMd, { mode: "sanitised" });
}

/**
 * Unsaved editor text for the owner's preview: the same sanitised pipeline as renderNoteBody, but
 * uncached, so throwaway drafts don't fill the cache.
 */
export function renderNotePreview(bodyMd: string) {
  return renderMarkdown(bodyMd, { mode: "sanitised" });
}
