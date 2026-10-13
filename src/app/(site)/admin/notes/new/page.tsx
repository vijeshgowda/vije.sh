import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/ui/Datasheet";
import styles from "@/components/ui/Datasheet.module.css";
import { requireAdminSection } from "@/features/admin/guard";
import { NoteEditor } from "@/features/blog/notes/components/NoteEditor";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "New note" };

export default async function NewNotePage() {
  await requireAdminSection("notes");
  return (
    <>
      <PageIntro kicker="Admin · Notes" title="New note">
        Starts as a draft: nothing is public until you publish it.{" "}
        <Link href="/admin/notes">Back to notes</Link>
      </PageIntro>
      <section className={styles.sec} aria-label="Editor">
        <NoteEditor />
      </section>
    </>
  );
}
