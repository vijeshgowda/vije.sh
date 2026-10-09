import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { NoteList } from "@/features/blog/components/NoteList";
import { listedNotes } from "@/features/blog/posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "Application notes on backend systems, security, small models and games.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  const notes = listedNotes();
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
