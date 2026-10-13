import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/Datasheet";
import { AdminLoading } from "@/features/admin/components/AdminLoading";
import { requireAdminSection } from "@/features/admin/guard";
import { ModerationLog } from "@/features/moderation/reports/components/ModerationLog";
import { listModerationLog } from "@/features/moderation/reports/queries";
import { logQuerySchema } from "@/features/moderation/reports/schemas";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Moderation log" };

export default async function AdminLogPage({ searchParams }: PageProps<"/admin/log">) {
  await requireAdminSection("log");
  const { page } = logQuerySchema.parse(await searchParams);
  return (
    <>
      <PageIntro kicker="Admin" title="Moderation log">
        Every staff action: hides, locks, moves, bans, role changes, resolved reports and category
        edits. Hidden threads can be unhidden from here.
      </PageIntro>
      <Suspense key={page} fallback={<AdminLoading />}>
        <Log page={page} />
      </Suspense>
    </>
  );
}

// uncached: read on every visit
async function Log({ page }: { page: number }) {
  return <ModerationLog log={await listModerationLog(page)} />;
}
