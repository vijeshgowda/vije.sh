import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/Datasheet";
import { AdminLoading } from "@/features/admin/components/AdminLoading";
import { requireAdminSection } from "@/features/admin/guard";
import { ReportQueue } from "@/features/moderation/reports/components/ReportQueue";
import { listOpenReports, listResolvedReports } from "@/features/moderation/reports/queries";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  await requireAdminSection("reports");
  return (
    <>
      <PageIntro kicker="Admin" title="Reports">
        Reports from members, oldest first. Hide the post or ban the member if needed, then mark the
        reports actioned or dismiss them.
      </PageIntro>
      <Suspense fallback={<AdminLoading />}>
        <Queue />
      </Suspense>
    </>
  );
}

// uncached: read on every visit
async function Queue() {
  const [{ groups, total }, resolved] = await Promise.all([
    listOpenReports(),
    listResolvedReports(),
  ]);
  return <ReportQueue groups={groups} total={total} resolved={resolved} />;
}
