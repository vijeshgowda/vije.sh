import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { assetUrl, copyPostAssets, isImageFile } from "./assets";
import { rehypePostAssets, resolvePostAsset } from "./rehype-post";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>';

const dirs: string[] = [];
const tmp = (files: Record<string, string | Buffer>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-assets-"));
  dirs.push(dir);
  for (const [f, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), data);
  }
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("assets", () => {
  it("knows image files by extension", () => {
    expect(isImageFile("a/Ship.WEBP")).toBe(true);
    expect(isImageFile("index.md")).toBe(false);
  });

  it("builds encoded public URLs", () => {
    expect(assetUrl("a-post", "img/ship 1.webp")).toBe("/blog/a-post/img/ship%201.webp");
  });

  it("copies only images, keeps folders and clears stale output", () => {
    const content = tmp({
      "a/index.md": "x",
      "a/ship.webp": "w",
      "a/img/deep.png": PNG_1X1,
      "b/notes.txt": "t",
    });
    const out = path.join(tmp({ "blog/stale/old.png": "o" }), "blog");
    expect(copyPostAssets(content, out)).toBe(2);
    expect(fs.existsSync(path.join(out, "a/ship.webp"))).toBe(true);
    expect(fs.existsSync(path.join(out, "a/img/deep.png"))).toBe(true);
    expect(fs.existsSync(path.join(out, "a/index.md"))).toBe(false);
    expect(fs.existsSync(path.join(out, "stale"))).toBe(false);
    expect(copyPostAssets(path.join(content, "missing"), out)).toBe(0);
  });
});

describe("resolvePostAsset", () => {
  it("resolves relative image paths inside the post folder", () => {
    const dir = tmp({ "img/a b.png": PNG_1X1 });
    expect(resolvePostAsset("p", dir, "./img/a%20b.png?v=1")).toEqual({
      url: "/blog/p/img/a%20b.png",
      file: path.join(dir, "img/a b.png"),
    });
  });

  it("ignores URLs, site paths, anchors and non-images", () => {
    for (const src of [
      "https://x.dev/a.png",
      "//x.dev/a.png",
      "/data/a.png",
      "#top",
      "?q",
      "x.pdf",
    ]) {
      expect(resolvePostAsset("p", "/tmp", src)).toBeNull();
    }
  });

  it("fails the build for missing files and paths that leave the post folder", () => {
    const dir = tmp({});
    expect(() => resolvePostAsset("p", dir, "./nope.webp")).toThrow(
      "content/blog/p: ./nope.webp: file not found",
    );
    expect(() => resolvePostAsset("p", dir, "../other/a.png")).toThrow(/inside the post folder/);
  });
});

describe("rehypePostAssets", () => {
  const render = async (md: string, files: Record<string, string | Buffer> = {}) => {
    const dir = tmp(files);
    const el = await renderMarkdown(md, { plugins: [[rehypePostAssets, { slug: "p", dir }]] });
    return renderToStaticMarkup(el);
  };

  it("serves relative images from /blog/<slug>/ with their size, lazily", async () => {
    const out = await render("![A dot](./dot.png)\n\n![Logo](img/logo.svg)\n", {
      "dot.png": PNG_1X1,
      "img/logo.svg": SVG,
    });
    expect(out).toContain(
      '<img src="/blog/p/dot.png" alt="A dot" width="1" height="1" loading="lazy" decoding="async"/>',
    );
    expect(out).toContain('src="/blog/p/img/logo.svg" alt="Logo" width="40" height="20"');
  });

  it("keeps sizes written in raw HTML and skips sizes it can't read", async () => {
    const out = await render('<img src="./a.png" alt="" width="300">\n\n![Bad](./bad.png)\n', {
      "a.png": PNG_1X1,
      "bad.png": "not an image",
    });
    expect(out).toContain('<img src="/blog/p/a.png" alt="" width="300" loading="lazy"');
    expect(out).toContain('<img src="/blog/p/bad.png" alt="Bad" loading="lazy"');
  });

  it("turns a titled image on its own line into a captioned figure", async () => {
    const out = await render(
      '![Rack](./r.png "Rack after the move")\n\nText ![i](./r.png "t") here\n',
      {
        "r.png": PNG_1X1,
      },
    );
    expect(out).toMatch(
      /<figure><img src="\/blog\/p\/r.png" alt="Rack"[^>]*\/><figcaption>Rack after the move<\/figcaption><\/figure>/,
    );
    expect(out).toContain('<p>Text <img src="/blog/p/r.png" alt="i" title="t"');
  });

  it("allows images from the image host and fails the build for other sites", async () => {
    expect(await render("![x](https://img.vije.sh/a.webp)\n")).toContain(
      'src="https://img.vije.sh/a.webp"',
    );
    expect(await render("![x](/data/a.png)\n")).toContain('src="/data/a.png"');
    await expect(render("![x](https://example.com/a.png)\n")).rejects.toThrow(/CSP blocks/);
  });

  it("opens external links in a new tab and rewrites links to local images", async () => {
    const out = await render(
      "[ext](https://example.com) [own](https://vije.sh/work) [rel](/lab) [full](./dot.png)\n",
      { "dot.png": PNG_1X1 },
    );
    expect(out).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer" aria-describedby="newtab">ext</a>',
    );
    expect(out).toContain('<a href="https://vije.sh/work">own</a>');
    expect(out).toContain('<a href="/lab">rel</a>');
    expect(out).toContain('<a href="/blog/p/dot.png">full</a>');
  });
});
