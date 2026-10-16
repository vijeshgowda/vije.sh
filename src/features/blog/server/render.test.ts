import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 'use cache' is a no-op outside Next.js, but cacheLife/cacheTag throw there.
const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag }));

const { renderNoteBody, renderNotePreview, renderPostBody } = await import("./render");

describe("rendering post bodies", () => {
  it("renders a git post in trusted mode with its images", async () => {
    const html = renderToStaticMarkup((await renderPostBody("planning-this-site"))!);
    expect(html).toContain('src="/blog/planning-this-site/stack.svg"');
    expect(await renderPostBody("no-such-post")).toBeNull();
  });

  it("renders the motorcycle guide with local captioned photos and valid contents links", async () => {
    const html = renderToStaticMarkup((await renderPostBody("best-motorcycles-2026"))!);
    expect(html.match(/<figure>/g)).toHaveLength(5);
    expect(html.match(/<figcaption>/g)).toHaveLength(5);
    for (const image of [
      "yamaha-mt-07",
      "triumph-street-triple",
      "bmw-r-1300-gs",
      "yamaha-tenere-700",
      "royal-enfield-himalayan",
    ]) {
      expect(html).toContain(`src="/blog/best-motorcycles-2026/${image}.webp"`);
    }
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html).toContain(`id="${anchor}"`);
    }
    expect(html).toContain("Find your starting point in the motorcycle shortlist");
    expect(html).toContain("CC BY-SA 4.0");
  });

  it("renders the reliability guide with fifteen local credited photos and working contents links", async () => {
    const html = renderToStaticMarkup((await renderPostBody("most-reliable-motorcycles"))!);
    expect(html.match(/<figure>/g)).toHaveLength(15);
    expect(html.match(/<figcaption>/g)).toHaveLength(15);
    for (const image of [
      "yamaha-mt-07",
      "suzuki-sv650",
      "yamaha-mt-09",
      "honda-cbr600rr",
      "suzuki-gsx-r750",
      "yamaha-r1",
      "honda-fireblade",
      "suzuki-v-strom-650",
      "kawasaki-versys-650",
      "yamaha-tenere-700",
      "honda-gold-wing",
      "bmw-r1200rt",
      "yamaha-fjr1300",
      "honda-nc750x",
      "yamaha-tracer-700",
    ]) {
      expect(html).toContain(`src="/blog/most-reliable-motorcycles/${image}.webp"`);
    }
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html).toContain(`id="${anchor}"`);
    }
    expect(html).toContain("Photograph register");
    expect(html).toContain("CC BY-SA 4.0");
    expect(html).not.toContain("[gsa1300]");
  });

  it("renders a note through the sanitised pipeline, tagged for revalidation", async () => {
    const html = renderToStaticMarkup(
      await renderNoteBody("a-note", "## Hi\n\n<script>x()</script>\n\n[out](https://example.com)"),
    );
    expect(html).toContain('<h2 id="user-content-hi">Hi</h2>');
    expect(html).not.toContain("<script");
    expect(html).toContain('rel="nofollow ugc noopener"');
    expect(cacheTag).toHaveBeenCalledWith("notes", "note:a-note");
  });

  it("previews unsaved note text through the same sanitised pipeline, uncached", async () => {
    cacheTag.mockClear();
    const html = renderToStaticMarkup(await renderNotePreview("# Draft\n\n<img src=x onerror=y>"));
    expect(html).toContain('<h1 id="user-content-draft">Draft</h1>');
    expect(html).not.toContain("<img");
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it("renders mermaid blocks as diagram islands that show their source until hydrated", async () => {
    const md = '```mermaid\ngraph TD\n  accTitle: Flow\n  A["<script>x()</script>"] --> B\n```\n';
    for (const body of [await renderNoteBody("d-note", md), await renderNotePreview(md)]) {
      const html = renderToStaticMarkup(body);
      expect(html).toContain('role="img" aria-label="Flow" aria-hidden="true"');
      expect(html).toMatch(/<pre[^>]*><code>graph TD/);
      expect(html).toContain("&lt;script&gt;x()&lt;/script&gt;");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("data-mermaid");
    }
  });
});
