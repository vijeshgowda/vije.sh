import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Notes" };

export default async function AdminNotesPage() {
  await requireAdminSection("notes");
  return <AdminStub title="Notes">Write, preview and publish blog notes.</AdminStub>;
}
