import { renderToStaticMarkup } from "react-dom/server";
import type { Root } from "hast";
import { describe, expect, it } from "vitest";
import { readMinutes, renderMarkdown } from "./markdown";

const html = async (md: string, plugins?: Parameters<typeof renderMarkdown>[1]) =>
  renderToStaticMarkup(await renderMarkdown(md, plugins));

describe("renderMarkdown", () => {
  it("renders GFM with heading anchors", async () => {
    const out = await html("## Two words\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n");
    expect(out).toContain('<h2 id="two-words">Two words</h2>');
    expect(out).toContain("<table>");
    expect(out).toContain('type="checkbox"');
  });

  it("keeps raw HTML, since git posts are trusted", async () => {
    const out = await html("<details><summary>More</summary>\n\nHidden *text*\n\n</details>\n");
    expect(out).toContain("<details><summary>More</summary>");
    expect(out).toContain("<em>text</em>");
  });

  it("highlights fenced code with both theme colours and leaves unknown languages plain", async () => {
    const ts = await html("```ts\nconst a = 1;\n```\n");
    expect(ts).toContain('class="shiki');
    expect(ts).toMatch(/--shiki-light:#[0-9a-f]{6}/i);
    expect(ts).toMatch(/--shiki-dark:#[0-9a-f]{6}/i);
    const odd = await html("```nosuchlang\nplain\n```\n");
    expect(odd).toContain("plain");
  });

  it("runs extra rehype plugins", async () => {
    const shout = () => (tree: Root) => {
      tree.children.unshift({ type: "text", value: "PLUGIN " });
    };
    expect(await html("hi\n", { plugins: [shout] })).toBe("PLUGIN <p>hi</p>");
  });
});

describe("readMinutes", () => {
  it("counts 220 words a minute, at least one", () => {
    expect(readMinutes("")).toBe(1);
    expect(readMinutes("word ".repeat(660))).toBe(3);
  });
});
