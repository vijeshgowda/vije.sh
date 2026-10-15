import { createElement } from "react";
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

  it("renders chosen elements with the given components", async () => {
    const out = await html("hi\n", {
      components: { p: ({ children }) => createElement("section", null, children) },
    });
    expect(out).toBe("<section>hi</section>");
  });
});

describe("renderMarkdown, sanitised mode", () => {
  const safe = (md: string, plugins?: Parameters<typeof renderMarkdown>[1]) =>
    html(md, { ...plugins, mode: "sanitised" });

  it("drops raw HTML, including script, iframe and style tags", async () => {
    const out = await safe(
      'Hi <script>alert(1)</script> there\n\n<iframe src="https://evil.example"></iframe>\n\n<style>body{display:none}</style>\n\n<details><summary>x</summary>y</details>\n',
    );
    expect(out).not.toMatch(/<script|<iframe|<style|<details|evil|display:none/);
    // the tags go; text between inline tags is left as harmless text
    expect(out).toContain("<p>Hi alert(1) there</p>");
  });

  it("drops event handler and style attributes from raw HTML", async () => {
    const out = await safe(
      '<img src="x" onerror="alert(1)">\n\n<a href="https://a.example" onclick="alert(1)" style="color:red">x</a>\n\n<p onmouseover="alert(1)">p</p>\n',
    );
    expect(out).not.toMatch(/onerror|onclick|onmouseover|style=|alert/);
  });

  it("removes javascript:, vbscript: and data: URLs from links and images", async () => {
    const out = await safe(
      "[a](javascript:alert(1)) [b](JaVaScRiPt:alert(2)) [c](vbscript:msgbox) <javascript:alert(3)>\n\n" +
        "[d](data:text/html;base64,PHNjcmlwdD4=) ![e](data:image/svg+xml;base64,PHN2Zz4=)\n\n" +
        "[f](  javascript:alert(4)) ![g](javascript:alert(5))\n",
    );
    expect(out).not.toMatch(/(href|src)=/);
    expect(out).toContain("<a>a</a>");
    expect(out).toContain("<a>javascript:alert(3)</a>");
    expect(out).toContain('<img alt="e"/>');
  });

  it("keeps Markdown formatting, GFM and safe links, with rel=nofollow ugc noopener", async () => {
    const out = await safe(
      "## Title\n\n**bold** [site](https://example.com) <https://auto.example> [mail](mailto:a@b.c) [rel](/forum)\n\n| a |\n| - |\n| 1 |\n\n- [x] done\n\n![pic](https://img.example/p.png)\n",
    );
    expect(out).toContain('<h2 id="user-content-title">Title</h2>');
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('<a href="https://example.com" rel="nofollow ugc noopener">site</a>');
    expect(out).toContain(
      '<a href="https://auto.example" rel="nofollow ugc noopener">https://auto.example</a>',
    );
    expect(out).toContain('<a href="mailto:a@b.c" rel="nofollow ugc noopener">mail</a>');
    expect(out).toContain('<a href="/forum" rel="nofollow ugc noopener">rel</a>');
    expect(out).toContain("<table>");
    expect(out).toContain('<input type="checkbox" disabled="" checked=""/>');
    expect(out).toContain('<img src="https://img.example/p.png" alt="pic"/>');
  });

  it("drops irc and xmpp links, which the default allow-list would keep", async () => {
    const out = await safe("[a](irc://irc.example/chan) [b](xmpp:me@example.com)\n");
    expect(out).toBe("<p><a>a</a> <a>b</a></p>");
  });

  it("prefixes ids once and points in-page links (footnotes, headings) at them, without rel", async () => {
    const out = await safe(
      "# Top\n\nText[^1] [up](#top) [same](#user-content-top) [bare](#)\n\n[^1]: Note\n",
    );
    expect(out).toContain('<h1 id="user-content-top">Top</h1>');
    expect(out).toMatch(/<a href="#user-content-fn-1" id="user-content-fnref-1"[^>]*>1<\/a>/);
    expect(out).toContain('<li id="user-content-fn-1">');
    expect(out).toContain('href="#user-content-fnref-1"');
    expect(out).toContain('aria-describedby="user-content-footnote-label"');
    expect(out).toContain('id="user-content-footnote-label"');
    expect(out).toContain('<a href="#user-content-top">up</a>');
    expect(out).toContain('<a href="#user-content-top">same</a>');
    expect(out).toContain('<a href="#">bare</a>');
    expect(out).not.toContain("user-content-user-content");
    expect(out).not.toMatch(/href="#[^"]*"[^>]*rel=/);
  });

  it("uses a custom id prefix, so several bodies can share a page", async () => {
    const out = await safe("# Top\n\n[up](#top)\n", { idPrefix: "user-content-r7-" });
    expect(out).toBe(
      '<h1 id="user-content-r7-top">Top</h1>\n<p><a href="#user-content-r7-top">up</a></p>',
    );
  });

  it("highlights fenced code after sanitising, so Shiki's styles survive", async () => {
    const out = await safe("```ts\nconst a = 1;\n```\n");
    expect(out).toContain('class="shiki');
    expect(out).toMatch(/--shiki-light:#[0-9a-f]{6}/i);
  });

  it("runs extra plugins after sanitising", async () => {
    const mark = () => (tree: Root) => {
      tree.children.unshift({
        type: "element",
        tagName: "span",
        properties: { style: "color:red" },
        children: [],
      });
    };
    expect(await safe("hi\n", { plugins: [mark] })).toBe(
      '<span style="color:red"></span><p>hi</p>',
    );
  });

  it("is not the default: trusted mode still keeps raw HTML", async () => {
    expect(await html("<kbd>K</kbd>\n")).toContain("<kbd>K</kbd>");
    expect(await safe("<kbd>K</kbd>\n")).not.toContain("<kbd>");
  });
});

describe("readMinutes", () => {
  it("counts 220 words a minute, at least one", () => {
    expect(readMinutes("")).toBe(1);
    expect(readMinutes("word ".repeat(660))).toBe(3);
  });
});
