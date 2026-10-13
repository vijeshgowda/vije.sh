import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/form", () => ({
  default: ({ action, ...rest }: ComponentProps<"form"> & { action: string }) => (
    <form action={action} {...rest} />
  ),
}));

const { MemberSearch, MemberStatus, MemberTable, RolePills } = await import("./MemberTable");

const member = (handle: string | null, extra = {}) => ({
  handle,
  displayName: null,
  joinedAt: new Date("2026-10-01T23:30:00Z"),
  onboarded: true,
  banned: false,
  roles: [],
  ...extra,
});

describe("RolePills", () => {
  it("labels stored roles with ROLE_LABEL and a moderator's category", () => {
    render(
      <RolePills
        roles={[
          { role: "admin", categoryId: null, categoryName: null },
          { role: "moderator", categoryId: "4", categoryName: "Games" },
        ]}
      />,
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Moderator · Games")).toBeInTheDocument();
  });

  it("shows Member for no roles", () => {
    render(<RolePills roles={[]} />);
    expect(screen.getByText("Member")).toBeInTheDocument();
  });
});

describe("MemberStatus", () => {
  it("shows banned before not onboarded before active", () => {
    const { rerender } = render(<MemberStatus banned onboarded={false} />);
    expect(screen.getByText("Banned")).toBeInTheDocument();
    rerender(<MemberStatus banned={false} onboarded={false} />);
    expect(screen.getByText("Not onboarded")).toBeInTheDocument();
    rerender(<MemberStatus banned={false} onboarded />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

describe("MemberSearch", () => {
  it("is a GET search form for /admin/members, prefilled", () => {
    render(<MemberSearch q="nora" />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/admin/members");
    expect(within(form).getByRole("searchbox", { name: "Handle or display name" })).toHaveValue(
      "nora",
    );
    expect(within(form).getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});

describe("MemberTable", () => {
  it("lists members with links, roles, UTC join date and status", () => {
    render(
      <MemberTable
        q=""
        result={{
          members: [
            member("Nora", {
              displayName: "Nora K",
              banned: true,
              roles: [{ role: "superuser", categoryId: null, categoryName: null }],
            }),
            member(null, { onboarded: false }),
          ],
          total: 2,
          page: 1,
          pages: 1,
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "2 members, newest first" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByRole("link", { name: "@Nora" })).toHaveAttribute(
      "href",
      "/admin/members/Nora",
    );
    expect(rows[1]).toHaveTextContent("Nora K");
    expect(rows[1]).toHaveTextContent("Superuser");
    expect(rows[1]).toHaveTextContent("2026-10-01");
    expect(rows[1]).toHaveTextContent("Banned");
    expect(rows[2]).toHaveTextContent("(no handle)");
    expect(rows[2]).toHaveTextContent("Not onboarded");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("pages with previous and next links that keep the search", () => {
    render(
      <MemberTable q="a b" result={{ members: [member("nora")], total: 1, page: 2, pages: 3 }} />,
    );
    expect(
      screen.getByRole("table", { name: "1 member matching “a b”, newest first" }),
    ).toBeInTheDocument();
    const pager = screen.getByRole("navigation", { name: "Member pages" });
    expect(pager).toHaveTextContent("Page 2 of 3");
    expect(within(pager).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/admin/members?q=a+b",
    );
    expect(within(pager).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/members?q=a+b&page=3",
    );
  });

  it("says when nothing matches, or the page is past the end", () => {
    const empty = { members: [], total: 0, page: 1, pages: 1 };
    const { rerender } = render(<MemberTable q="zzz" result={empty} />);
    expect(screen.getByRole("status")).toHaveTextContent("No members match “zzz”.");
    rerender(<MemberTable q="" result={{ ...empty, total: 3, page: 9 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No members on this page.");
  });

  it("formats large totals", () => {
    render(
      <MemberTable q="" result={{ members: [member("nora")], total: 1234, page: 1, pages: 25 }} />,
    );
    expect(screen.getByRole("table", { name: "1,234 members, newest first" })).toBeInTheDocument();
    const pager = screen.getByRole("navigation", { name: "Member pages" });
    expect(within(pager).queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
  });
});
