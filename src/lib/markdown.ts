import "server-only";
import type { ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeShiki from "@shikijs/rehype";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";

/**
 * The Markdown pipeline (application.md 5, 9), trusted mode: raw HTML is kept, so only use it for
 * content committed to git. Database notes need a sanitised mode (rehype-sanitize) first.
 * Renders to React elements, so no dangerouslySetInnerHTML.
 */
export async function renderMarkdown(
  source: string,
  { plugins = [] }: { plugins?: PluggableList } = {},
): Promise<ReactElement> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(plugins)
    .use(rehypeShiki, {
      // High-contrast themes keep every token at AA on the code block background.
      themes: { light: "github-light-high-contrast", dark: "github-dark-high-contrast" },
      defaultColor: false,
      // Load grammars as posts use them; the default loads all of them up front (seconds).
      langs: [],
      lazy: true,
      fallbackLanguage: "text",
    });
  const tree = await processor.run(processor.parse(source));
  return toJsxRuntime(tree, { Fragment, jsx, jsxs });
}

/** Minutes to read at 220 words a minute, at least 1. */
export function readMinutes(source: string): number {
  const words = source.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
