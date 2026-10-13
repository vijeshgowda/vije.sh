import { Suspense } from "react";
import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { ForumBar } from "@/features/forum/components/ForumBar";
import { NewThread } from "@/features/forum/components/NewThread";
import { ThreadList } from "@/features/forum/components/ThreadList";
import { databaseReady, listCategories, listLatestThreads } from "@/features/forum/queries";

export const metadata: Metadata = {
  title: "Forum",
  description: "The community bus: systems, small models and games.",
  alternates: { canonical: "/forum" },
};

// Prerendered from cached reads; without a database at build time it renders on request instead.
async function Threads() {
  if (!(await databaseReady())) throw new Error("The forum database is unavailable.");
  const [categories, threads] = await Promise.all([listCategories(), listLatestThreads()]);
  return (
    <Section id="threads" no={11} title="Threads" note={`${threads.length} on the bus`}>
      <ForumBar categories={categories} actions={<NewThread categories={categories} />} />
      <ThreadList threads={threads} />
    </Section>
  );
}

export default function ForumPage() {
  return (
    <>
      <RunHead label="Community bus" />
      <PageIntro kicker="Section 11" title="Forum">
        The community bus. Guests read; members transmit.
      </PageIntro>
      <Suspense>
        <Threads />
      </Suspense>
      <RunFoot page={6} />
    </>
  );
}
