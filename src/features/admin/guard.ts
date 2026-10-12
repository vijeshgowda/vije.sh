import "server-only";
import { requirePage } from "@/features/auth/guards";
import type { SessionUser } from "@/features/auth/queries";
import { ADMIN_SECTIONS, type AdminSectionKey } from "./sections";

/**
 * Every /admin page calls this itself (the layout's check doesn't run again on client-side
 * navigation) and, like the layout, exports `instant = false`: guests sign in and come back,
 * anyone without access to the section gets a 404.
 */
export function requireAdminSection(key: AdminSectionKey): Promise<SessionUser> {
  const { href, action } = ADMIN_SECTIONS[key];
  return requirePage(href, action);
}
