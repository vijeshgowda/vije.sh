import "server-only";
import type { Element, Root } from "hast";
import type { ReactElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeShiki, { type RehypeShikiOptions } from "@shikijs/rehype";
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";
import { visit } from "unist-util-visit";

/**
 * - `trusted`: raw HTML is kept. Only for content committed to git (blog posts).
 * - `sanitised`: for anything stored in the database (forum posts, notes). Raw HTML is dropped,
 *   the tree goes through rehype-sanitize (GitHub's allow-list, http/https/mailto links only) and
 *   links get `rel="nofollow ugc noopener"`.
 */
export type MarkdownMode = "trusted" | "sanitised";

export interface RenderMarkdownOptions {
  mode?: MarkdownMode;
  /**
   * Sanitised mode only: prefix for every id (headings, footnotes), so user content can't clobber
   * globals or collide with page ids. Use a distinct prefix per item when rendering several
   * bodies on one page, e.g. `user-content-r42-`.
   */
  idPrefix?: string;
  /** Extra rehype plugins. They are code, so trusted; in sanitised mode they run after sanitising. */
  plugins?: PluggableList;
  /** Components to render chosen elements with, e.g. a `pre` a plugin marked for a client island. */
  components?: Partial<Components>;
}

export const UGC_LINK_REL = "nofollow ugc noopener";

export const DEFAULT_ID_PREFIX = "user-content-";

/** GitHub-style allow-list with links narrowed to http, https and mailto (no irc/xmpp). */
const sanitiseSchema = (idPrefix: string): SanitizeSchema => ({
  ...defaultSchema,
  clobberPrefix: idPrefix,
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"] },
});

/**
 * Links that leave the page get `rel`. In-page links (`#x`, footnotes) are pointed at the
 * prefixed id the sanitiser gave their target, as GitHub does in the browser.
 */
function rehypeUgcLinks({ idPrefix }: { idPrefix: string }) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const href = node.properties.href;
      if (node.tagName !== "a" || typeof href !== "string") return;
      if (!href.startsWith("#")) node.properties.rel = UGC_LINK_REL.split(" ");
      else if (href.length > 1 && !href.startsWith(`#${idPrefix}`))
        node.properties.href = `#${idPrefix}${href.slice(1)}`;
    });
  };
}

const SHIKI_OPTIONS: RehypeShikiOptions = {
  // High-contrast themes keep every token at AA on the code block background.
  themes: { light: "github-light-high-contrast", dark: "github-dark-high-contrast" },
  defaultColor: false,
  // Load grammars as posts use them; the default loads all of them up front (seconds).
  langs: [],
  lazy: true,
  fallbackLanguage: "text",
};

/**
 * The one Markdown pipeline (application.md 5, 9, 14). Renders to React elements, so no
 * dangerouslySetInnerHTML. Defaults to `trusted` mode for git posts; pass `mode: "sanitised"`
 * for database content.
 */
export async function renderMarkdown(
  source: string,
  {
    mode = "trusted",
    idPrefix = DEFAULT_ID_PREFIX,
    plugins = [],
    components,
  }: RenderMarkdownOptions = {},
): Promise<ReactElement> {
  const processor =
    mode === "sanitised"
      ? unified()
          .use(remarkParse)
          .use(remarkGfm)
          // Without allowDangerousHtml, raw HTML in the source is dropped. Footnote ids stay
          // unprefixed here; the sanitiser prefixes every id exactly once.
          .use(remarkRehype, { clobberPrefix: "" })
          .use(rehypeSlug)
          // before Shiki: Shiki's output (inline styles) would not survive the allow-list
          .use(rehypeSanitize, sanitiseSchema(idPrefix))
          .use(rehypeUgcLinks, { idPrefix })
          .use(plugins)
          .use(rehypeShiki, SHIKI_OPTIONS)
      : unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeSlug)
          .use(plugins)
          .use(rehypeShiki, SHIKI_OPTIONS);
  const tree = await processor.run(processor.parse(source));
  return toJsxRuntime(tree, { Fragment, jsx, jsxs, components });
}

/** Minutes to read at 220 words a minute, at least 1. */
export function readMinutes(source: string): number {
  const words = source.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
