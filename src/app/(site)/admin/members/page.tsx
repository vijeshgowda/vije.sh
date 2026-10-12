import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Members" };

export default async function AdminMembersPage() {
  await requireAdminSection("members");
  return (
    <AdminStub title="Members">
      Find a member, grant or revoke roles, and ban or lift a ban.
    </AdminStub>
  );
}
