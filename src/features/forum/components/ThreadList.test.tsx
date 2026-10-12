import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../types";
import { ForumBar } from "./ForumBar";
import { ThreadList } from "./ThreadList";

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: "42",
  title: "Pooling with pg on Vercel",
  category: { slug: "engineering", name: "Engineering" },
  authorHandle: "ada",
  replyCount: 3,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  lastActivityAt: new Date("2026-10-05T12:30:00Z"),
  pinned: false,
  locked: false,
  ...over,
});

describe("ThreadList", () => {
  it("links each thread with its address, meta and reply count", () => {
    render(<ThreadList threads={[thread()]} />);
    const link = screen.getByRole("link", { name: /Pooling with pg on Vercel/ });
    expect(link).toHaveAttribute("href", "/forum/engineering/42");
    expect(link).toHaveTextContent("0x2A");
    expect(link).toHaveTextContent("Engineering · ada · 5 Oct 2026");
    expect(within(link).getByText("5 Oct 2026")).toHaveAttribute(
      "datetime",
      "2026-10-05T12:30:00.000Z",
    );
    expect(within(link).getByTitle("Replies")).toHaveTextContent("3 replies");
    expect(within(link).queryByText("Pinned")).toBeNull();
    expect(within(link).queryByText("Locked")).toBeNull();
  });

  it("shows Pinned and Locked badges, one reply and deleted authors", () => {
    render(
      <ThreadList
        threads={[
          thread({ id: "1", pinned: true, replyCount: 1, authorHandle: null }),
          thread({ id: "2", title: "Locked one", locked: true, replyCount: 0 }),
        ]}
      />,
    );
    const [first, second] = screen.getAllByRole("link");
    expect(within(first!).getByText("Pinned")).toBeInTheDocument();
    expect(within(first!).getByTitle("Replies")).toHaveTextContent(/^1 reply$/);
    expect(first).toHaveTextContent("Engineering · [deleted] ·");
    expect(within(second!).getByText("Locked")).toBeInTheDocument();
    expect(within(second!).queryByText("Pinned")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says so when there are no threads", () => {
    const { rerender } = render(<ThreadList threads={[]} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("No threads yet.")).toBeInTheDocument();
    rerender(<ThreadList threads={[]} empty="No threads in Games yet." />);
    expect(screen.getByText("No threads in Games yet.")).toBeInTheDocument();
  });
});

describe("ForumBar", () => {
  const categories = [
    { slug: "engineering", name: "Engineering" },
    { slug: "local-ai", name: "Local AI" },
  ];

  it("links All and every category, marking the current one", () => {
    render(<ForumBar categories={categories} current="local-ai" />);
    const nav = screen.getByRole("navigation", { name: "Forum categories" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["All", "/forum"],
      ["Engineering", "/forum/engineering"],
      ["Local AI", "/forum/local-ai"],
    ]);
    expect(within(nav).getByRole("link", { name: "Local AI" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("marks All on /forum and renders the actions slot", () => {
    render(
      <ForumBar categories={categories} actions={<button type="button">New thread</button>} />,
    );
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
  });
});
