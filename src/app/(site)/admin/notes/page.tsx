import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { PageIntro } from "@/components/ui/Datasheet";
import styles from "@/components/ui/Datasheet.module.css";
import { requireAdminSection } from "@/features/admin/guard";
import { NoteTable } from "@/features/blog/notes/components/NoteTable";
import noteStyles from "@/features/blog/notes/components/NoteAdmin.module.css";
import { listNotesForAdmin } from "@/features/blog/notes/queries";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Notes" };

export default async function AdminNotesPage() {
  await requireAdminSection("notes");
  const notes = await listNotesForAdmin();
  const published = notes.filter((n) => n.status === "published").length;
  return (
    <>
      <PageIntro kicker="Admin" title="Notes">
        Short posts stored in the database, published to /blog next to the git posts.
      </PageIntro>
      <section className={styles.sec} aria-label="All notes">
        <div className={noteStyles.bar}>
          <span className={noteStyles.count}>
            {notes.length} {notes.length === 1 ? "note" : "notes"}, {published} published
          </span>
          <ButtonLink href="/admin/notes/new" variant="red" size="sm">
            New note
          </ButtonLink>
        </div>
        <NoteTable notes={notes} />
      </section>
    </>
  );
}
