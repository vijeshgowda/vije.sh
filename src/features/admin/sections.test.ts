import { describe, expect, it } from "vitest";
import type { CurrentUser, RoleGrant } from "@/lib/authz";
import { adminLinksFor } from "./sections";

const user = (...roles: RoleGrant[]): CurrentUser => ({
  id: "u1",
  handle: "nora",
  onboarded: true,
  banned: false,
  roles,
});
const labels = (u: CurrentUser | null) => adminLinksFor(u).map((l) => l.label);

describe("adminLinksFor()", () => {
  it("shows nothing to guests, members and moderators", () => {
    expect(labels(null)).toEqual([]);
    expect(labels(user())).toEqual([]);
    expect(labels(user({ role: "moderator", categoryId: null }))).toEqual([]);
  });

  it("hides notes and categories from superusers", () => {
    expect(labels(user({ role: "superuser", categoryId: null }))).toEqual([
      "Overview",
      "Members",
      "Reports",
      "Log",
    ]);
  });

  it("shows the owner every section", () => {
    expect(adminLinksFor(user({ role: "admin", categoryId: null }))).toEqual([
      { href: "/admin", label: "Overview" },
      { href: "/admin/members", label: "Members" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/log", label: "Log" },
      { href: "/admin/notes", label: "Notes" },
      { href: "/admin/categories", label: "Categories" },
    ]);
  });

  it("shows a banned owner nothing", () => {
    expect(labels({ ...user({ role: "admin", categoryId: null }), banned: true })).toEqual([]);
  });
});
