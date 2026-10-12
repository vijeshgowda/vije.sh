import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { NoteList } from "@/features/blog/components/NoteList";
import { blogNoteRows } from "@/features/blog/server/catalog";

export const metadata: Metadata = {
  title: "Blog",
  description: "Application notes on backend systems, security, small models and games.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const notes = await blogNoteRows();
  return (
    <>
      <RunHead label="Application notes" />
      <PageIntro kicker="Section 10" title="Application notes">
        Notes on backend systems, security, small models and games, newest first.
      </PageIntro>
      <Section
        id="index"
        no={10}
        title="Index"
        note={`${notes.length} note${notes.length === 1 ? "" : "s"}`}
      >
        <NoteList notes={notes} />
      </Section>
      <RunFoot page={5} />
    </>
  );
}
