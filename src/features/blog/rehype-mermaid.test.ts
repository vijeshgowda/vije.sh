import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMarkdown, type MarkdownMode } from "@/lib/markdown";
import { rehypeMermaid } from "./rehype-mermaid";

const html = async (md: string, mode: MarkdownMode) =>
  renderToStaticMarkup(await renderMarkdown(md, { mode, plugins: [rehypeMermaid] }));

const MODES: MarkdownMode[] = ["trusted", "sanitised"];

describe.each(MODES)("rehypeMermaid, %s mode", (mode) => {
  it("turns a mermaid block into a marked pre holding the source as text, skipping Shiki", async () => {
    const out = await html("```mermaid\ngraph TD\n  A --> B\n```\n", mode);
    expect(out).toBe('<pre class="mermaid-src" data-mermaid="">graph TD\n  A --&gt; B</pre>');
  });

  it("leaves other code blocks to Shiki", async () => {
    const out = await html("```ts\nconst a = 1;\n```\n", mode);
    expect(out).toContain('class="shiki');
    expect(out).not.toContain("data-mermaid");
  });

  it("keeps markup inside a mermaid block as inert text", async () => {
    const out = await html(
      '```mermaid\ngraph TD\n  A["<script>alert(1)</script>"] --> B["<img src=x onerror=alert(1)>"]\n```\n',
      mode,
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("rehypeMermaid with raw HTML", () => {
  it("still drops raw HTML around a diagram in sanitised mode", async () => {
    const out = await html("<script>x()</script>\n\n```mermaid\ngraph TD\n```\n", "sanitised");
    expect(out).toBe('<pre class="mermaid-src" data-mermaid="">graph TD</pre>');
  });

  it("only matches a pre whose one child is mermaid code", async () => {
    const out = await html(
      '<pre><code class="language-mermaid">a</code><code>b</code></pre>\n\n<pre>plain</pre>\n',
      "trusted",
    );
    expect(out).not.toContain("data-mermaid");
  });
});
