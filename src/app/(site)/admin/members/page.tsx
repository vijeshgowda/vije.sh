import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/Datasheet";
import { AdminLoading } from "@/features/admin/components/AdminLoading";
import { MemberSearch, MemberTable } from "@/features/admin/components/MemberTable";
import { requireAdminSection } from "@/features/admin/guard";
import { searchMembers } from "@/features/admin/queries";
import { membersQuerySchema } from "@/features/admin/schemas";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Members" };

export default async function AdminMembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requireAdminSection("members");
  const { q, page } = membersQuerySchema.parse(await searchParams);
  return (
    <>
      <PageIntro kicker="Admin" title="Members">
        Find a member, grant or revoke roles, and ban or lift a ban.
      </PageIntro>
      <MemberSearch q={q} />
      <Suspense key={`${q}:${page}`} fallback={<AdminLoading />}>
        <Members q={q} page={page} />
      </Suspense>
    </>
  );
}

// uncached: read on every visit
async function Members({ q, page }: { q: string; page: number }) {
  return <MemberTable result={await searchMembers(q, page)} q={q} />;
}
