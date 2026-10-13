import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HANDLE_RE } from "@/features/auth/handle";
import { MemberProfile } from "@/features/admin/components/MemberProfile";
import { requireAdminSection } from "@/features/admin/guard";
import { getMember, listCategoryOptions } from "@/features/admin/queries";

// waits for the session check like the layout (see layout.tsx); the member is read outside
// <Suspense> too, because an unknown handle calls notFound()
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/admin/members/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  return { title: HANDLE_RE.test(handle) ? `@${handle}` : "Member" };
}

export default async function AdminMemberPage({ params }: PageProps<"/admin/members/[handle]">) {
  const viewer = await requireAdminSection("members");
  const { handle } = await params;
  if (!HANDLE_RE.test(handle)) notFound();
  const member = await getMember(handle);
  if (!member) notFound();
  return <MemberProfile member={member} viewer={viewer} categories={await listCategoryOptions()} />;
}
