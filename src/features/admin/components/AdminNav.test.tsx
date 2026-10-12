import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin/members/42" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const { AdminNav, isCurrent } = await import("./AdminNav");

describe("AdminNav", () => {
  it("lists the given sections and marks the current one", () => {
    render(
      <AdminNav
        links={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/members", label: "Members" },
        ]}
      />,
    );
    const navEl = screen.getByRole("navigation", { name: "Admin sections" });
    expect(navEl).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("isCurrent() matches a section and the pages under it, overview only exactly", () => {
    expect(isCurrent("/admin", "/admin")).toBe(true);
    expect(isCurrent("/admin", "/admin/members")).toBe(false);
    expect(isCurrent("/admin/members", "/admin/members")).toBe(true);
    expect(isCurrent("/admin/members", "/admin/members/42")).toBe(true);
    expect(isCurrent("/admin/members", "/admin/membership")).toBe(false);
  });
});
