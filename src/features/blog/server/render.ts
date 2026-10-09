import "server-only";
import path from "node:path";
import { cacheLife } from "next/cache";
import { renderMarkdown } from "@/lib/markdown";
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
