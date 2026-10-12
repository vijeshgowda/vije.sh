import type { Route } from "next";
import { can, type Action, type CurrentUser } from "@/lib/authz";

/**
 * The /admin sections and who may open each (application.md 8.7): superusers and the owner see
 * everything except notes and categories, which are the owner's. Pages guard themselves with
 * requireAdminSection(key); AdminNav lists only the sections the user may open.
 */
export const ADMIN_SECTIONS = {
  overview: { href: "/admin", label: "Overview", action: "admin.view" },
  members: { href: "/admin/members", label: "Members", action: "admin.view" },
  reports: { href: "/admin/reports", label: "Reports", action: "report.review" },
  log: { href: "/admin/log", label: "Log", action: "admin.view" },
  notes: { href: "/admin/notes", label: "Notes", action: "blog.write" },
  categories: { href: "/admin/categories", label: "Categories", action: "category.manage" },
} as const satisfies Record<string, { href: Route; label: string; action: Action }>;

export type AdminSectionKey = keyof typeof ADMIN_SECTIONS;

export interface AdminLink {
  href: Route;
  label: string;
}

/** The sections this user may open, in menu order. */
export function adminLinksFor(user: CurrentUser | null): AdminLink[] {
  return Object.values(ADMIN_SECTIONS)
    .filter((s) => can(user, s.action))
    .map(({ href, label }) => ({ href, label }));
}
