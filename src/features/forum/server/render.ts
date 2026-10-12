import "server-only";
import { cacheLife } from "next/cache";
import { renderMarkdown } from "@/lib/markdown";

/**
 * A frame body from the database, through the sanitised Markdown pipeline. Keyed by the text, so
 * an edit is a new entry and the cache never goes stale. `key` (frame key) keeps heading and
 * footnote ids unique when several frames share a page.
 */
export async function renderFrameBody(markdown: string, key: string) {
  "use cache";
  cacheLife("max");
  return renderMarkdown(markdown, { mode: "sanitised", idPrefix: `user-content-${key}-` });
}
