import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/Datasheet";
import { AdminLoading } from "@/features/admin/components/AdminLoading";
import { AdminStats } from "@/features/admin/components/AdminStats";
import { requireAdminSection } from "@/features/admin/guard";
import { loadAdminStats } from "@/features/admin/queries";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  await requireAdminSection("overview");
  return (
    <>
      <PageIntro kicker="Admin" title="Overview">
        Members, posts, reports and bans at a glance, and how big the database is.
      </PageIntro>
      <Suspense fallback={<AdminLoading />}>
        <Stats />
      </Suspense>
    </>
  );
}

// uncached: counted on every visit
async function Stats() {
  return <AdminStats stats={await loadAdminStats()} />;
}
