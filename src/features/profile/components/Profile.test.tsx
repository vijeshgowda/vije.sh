import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Profile, ProfilePost } from "../types";
import { PostList } from "./PostList";
import { ProfileRegs } from "./ProfileRegs";

const posts: ProfilePost[] = [
  {
    kind: "reply",
    id: "7",
    threadId: "42",
    threadTitle: "Pooling with pg",
    category: { slug: "engineering", name: "Engineering" },
    createdAt: new Date("2026-10-06T09:00:00Z"),
  },
  {
    kind: "thread",
    id: "43",
    threadId: "43",
    threadTitle: "Small models",
    category: { slug: "ai", name: "AI" },
    createdAt: new Date("2026-10-05T23:30:00Z"),
  },
];

const profile = (over: Partial<Profile> = {}): Profile => ({
  handle: "Ada_99",
  role: "superuser",
  joinedAt: new Date("2026-10-01T08:00:00Z"),
  threadCount: 1,
  replyCount: 1,
  posts,
  ...over,
});

const value = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;

describe("ProfileRegs", () => {
  it("lists handle, role, joined date, counts and the last post", () => {
    render(<ProfileRegs profile={profile({ threadCount: 3, replyCount: 12 })} />);
    expect(value("Handle")).toHaveTextContent("Ada_99");
    expect(value("Role")).toHaveTextContent("Superuser");
    expect(within(value("Joined")).getByText("1 Oct 2026")).toHaveAttribute(
      "datetime",
      "2026-10-01T08:00:00.000Z",
    );
    expect(value("Threads")).toHaveTextContent("3");
    expect(value("Replies")).toHaveTextContent("12");
    expect(value("Last post")).toHaveTextContent("6 Oct 2026");
  });

  it("labels the owner and members, and shows no last post without posts", () => {
    const { unmount } = render(<ProfileRegs profile={profile({ role: "admin" })} />);
    expect(value("Role")).toHaveTextContent("Owner");
    unmount();
    render(<ProfileRegs profile={profile({ role: "member", posts: [] })} />);
    expect(value("Role")).toHaveTextContent("Member");
    expect(value("Last post")).toHaveTextContent("\u2014");
  });
});

describe("PostList", () => {
  it("links each post to its thread or reply frame", () => {
    render(<PostList posts={posts} />);
    const reply = screen.getByRole("link", { name: /Re: Pooling with pg/ });
    expect(reply).toHaveAttribute("href", "/forum/engineering/42#reply-7");
    expect(reply).toHaveTextContent("0x2A");
    expect(reply).toHaveTextContent(/Reply · Engineering · 6 Oct 2026/);
    const thread = screen.getByRole("link", { name: /Small models/ });
    expect(thread).toHaveAttribute("href", "/forum/ai/43");
    expect(thread).toHaveTextContent(/Thread · AI · 5 Oct 2026/);
  });

  it("says so when there are no posts", () => {
    render(<PostList posts={[]} />);
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
