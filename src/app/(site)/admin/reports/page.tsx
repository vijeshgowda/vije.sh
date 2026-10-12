import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  await requireAdminSection("reports");
  return (
    <AdminStub title="Reports">
      Reports from members, waiting to be actioned or dismissed.
    </AdminStub>
  );
}
