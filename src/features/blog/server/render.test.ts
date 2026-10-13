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
});
