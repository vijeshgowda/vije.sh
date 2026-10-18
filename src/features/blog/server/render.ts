import "server-only";
import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";
import { renderMarkdown, type RenderMarkdownOptions } from "@/lib/markdown";
import { BodyPre } from "../components/BodyPre";
import { noteTag, NOTES_TAG } from "../notes/tags";
import { CONTENT_DIR, getPost } from "../posts";
import { rehypeMermaid } from "../rehype-mermaid";
import { rehypePostAssets } from "../rehype-post";

/** ```mermaid blocks become client-rendered diagrams in every blog body (application.md 9). */
const DIAGRAMS = { plugins: [rehypeMermaid], components: { pre: BodyPre } } satisfies Pick<
  RenderMarkdownOptions,
  "plugins" | "components"
>;

/** A git post's body as React elements. Cached for good: git posts only change with a deploy. */
export async function renderPostBody(slug: string) {
  "use cache";
  cacheLife("max");
  const entry = getPost(slug);
  if (!entry) return null;
  const dir = path.join(CONTENT_DIR, entry.post.folder);
  return renderMarkdown(entry.post.body, {
    ...DIAGRAMS,
    plugins: [[rehypePostAssets, { slug, dir }], ...DIAGRAMS.plugins],
  });
}

/**
 * A database note's body, through the sanitised pipeline (no raw HTML, user-content- id prefix,
 * nofollow links). Keyed by the Markdown itself, so an edit never serves the old rendering.
 */
export async function renderNoteBody(slug: string, bodyMd: string) {
  "use cache";
  cacheLife("max");
  cacheTag(NOTES_TAG, noteTag(slug));
  return renderMarkdown(bodyMd, { ...DIAGRAMS, mode: "sanitised" });
}

/**
 * Unsaved editor text for the owner's preview: the same sanitised pipeline as renderNoteBody, but
 * uncached, so throwaway drafts don't fill the cache.
 */
export function renderNotePreview(bodyMd: string) {
  return renderMarkdown(bodyMd, { ...DIAGRAMS, mode: "sanitised" });
}
