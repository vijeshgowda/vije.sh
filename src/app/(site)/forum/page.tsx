import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { ForumBar } from "@/features/forum/components/ForumBar";
import { ThreadList } from "@/features/forum/components/ThreadList";
import { listCategories, listLatestThreads } from "@/features/forum/queries";

export const metadata: Metadata = {
  title: "Forum",
  description: "The community bus: systems, small models and games.",
  alternates: { canonical: "/forum" },
};

export default async function ForumPage() {
  const [categories, threads] = await Promise.all([listCategories(), listLatestThreads()]);
  return (
    <>
      <RunHead label="Community bus" />
      <PageIntro kicker="Section 11" title="Forum">
        The community bus. Guests read; members transmit.
      </PageIntro>
      <Section id="threads" no={11} title="Threads" note={`${threads.length} on the bus`}>
        <ForumBar categories={categories} />
        <ThreadList threads={threads} />
      </Section>
      <RunFoot page={6} />
    </>
  );
}
