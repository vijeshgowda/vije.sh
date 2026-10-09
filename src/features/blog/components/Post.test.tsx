import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Post as PostData, PostEntry } from "../posts";
import { Post } from "./Post";

const post: PostData = {
  slug: "quality-per-gb",
  title: "Quality per GB",
  date: "2026-09-20",
  summary: "Comparing low-bit models.",
  tags: ["Local AI"],
  visibility: "public",
  draft: false,
  body: "word ".repeat(500),
};
const row = (slug: string, title: string) => ({
  id: "AN-000",
  slug,
  title,
  summary: "",
  category: "",
  date: "2026-01-01",
});

describe("Post", () => {
  it("shows the note header, abstract, body and both neighbours", () => {
    const entry: PostEntry = {
      post: { ...post, updated: "2026-10-01" },
      id: "AN-002",
      newer: row("newer-one", "Newer one"),
      older: row("older-one", "Older one"),
    };
    render(
      <Post entry={entry}>
        <p>Body text</p>
      </Post>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Quality per GB" })).toBeInTheDocument();
    expect(screen.getByText("Application note AN-002")).toBeInTheDocument();
    expect(screen.getByText("Local AI")).toBeInTheDocument();
    expect(screen.getByText("20 Sep 2026")).toHaveAttribute("datetime", "2026-09-20");
    expect(screen.getByText("1 Oct 2026")).toHaveAttribute("datetime", "2026-10-01");
    expect(screen.getByText("2 min")).toBeInTheDocument();
    expect(screen.getByText("Comparing low-bit models.")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All notes/ })).toHaveAttribute("href", "/blog");
    expect(screen.getByRole("link", { name: /Older one/ })).toHaveAttribute(
      "href",
      "/blog/older-one",
    );
    expect(screen.getByRole("link", { name: /Newer one/ })).toHaveAttribute(
      "href",
      "/blog/newer-one",
    );
    expect(screen.queryByText("Draft")).toBeNull();
  });

  it("labels unlisted drafts and leaves out the pager", () => {
    render(
      <Post entry={{ post: { ...post, draft: true, visibility: "unlisted" }, id: null }}>
        <p>x</p>
      </Post>,
    );
    expect(screen.getByText("Unlisted note")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "More notes" })).toBeNull();
  });

  it("tracks reading progress as the page scrolls", () => {
    const { container } = render(
      <Post entry={{ post, id: "AN-001" }}>
        <p>x</p>
      </Post>,
    );
    const bar = container.querySelector<HTMLElement>('[aria-hidden="true"]');
    // jsdom has no layout: nothing to scroll counts as fully read
    expect(bar?.style.width).toBe("100%");
  });
});
