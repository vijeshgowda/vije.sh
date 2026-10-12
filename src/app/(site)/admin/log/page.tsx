import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Moderation log" };

export default async function AdminLogPage() {
  await requireAdminSection("log");
  return (
    <AdminStub title="Moderation log">
      Every staff action: hides, locks, bans, role changes and category edits.
    </AdminStub>
  );
}
