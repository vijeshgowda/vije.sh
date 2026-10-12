import type { Metadata } from "next";
import { RunHead } from "@/components/ui/Datasheet";
import { SITE } from "@/config/site";
import { AdminNav } from "@/features/admin/components/AdminNav";
import { adminLinksFor } from "@/features/admin/sections";
import { requirePage } from "@/features/auth/guards";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin · ${SITE.name}` },
  robots: { index: false, follow: false },
};

// Staff pages wait for the session check instead of streaming a static shell first: notFound()
// thrown inside a <Suspense> boundary makes React log a client-rendering error (#419) in the
// browser. `false` lets these segments block on runtime data (no static shell validation).
export const instant = false;

/**
 * Staff only (application.md 8.7). Guests without a session cookie were already sent to sign-in by
 * src/proxy.ts (a real 307); anyone else without admin.view gets the 404 page (noindex). Each page
 * checks its own section again with requireAdminSection(), because layouts don't re-render on
 * client-side navigation.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePage("/admin", "admin.view");
  return (
    <>
      <RunHead label="Admin" />
      <AdminNav links={adminLinksFor(user)} />
      {children}
    </>
  );
}
