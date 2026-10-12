import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await requireAdminSection("overview");
  return (
    <AdminStub title="Overview">
      Members, posts, reports and bans at a glance, and how big the database is.
    </AdminStub>
  );
}
