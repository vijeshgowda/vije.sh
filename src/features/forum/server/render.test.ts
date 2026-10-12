import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
const { renderFrameBody } = await import("./render");

describe("renderFrameBody", () => {
  it("renders sanitised Markdown with ids prefixed by the frame key", async () => {
    const html = renderToStaticMarkup(
      await renderFrameBody(
        "# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](https://e.example)\n",
        "reply-7",
      ),
    );
    expect(html).toContain('<h1 id="user-content-reply-7-hi">Hi</h1>');
    expect(html).not.toMatch(/<script|javascript:/);
    expect(html).toContain('<a href="https://e.example" rel="nofollow ugc noopener">y</a>');
  });
});
