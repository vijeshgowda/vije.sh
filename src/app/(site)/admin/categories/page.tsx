import type { Metadata } from "next";
import { AdminStub } from "@/features/admin/components/AdminStub";
import { requireAdminSection } from "@/features/admin/guard";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdminSection("categories");
  return (
    <AdminStub title="Categories">Create, rename, reorder and retire forum categories.</AdminStub>
  );
}
