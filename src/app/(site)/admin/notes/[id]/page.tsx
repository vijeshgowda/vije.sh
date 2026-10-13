import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/Datasheet";
import styles from "@/components/ui/Datasheet.module.css";
import { requireAdminSection } from "@/features/admin/guard";
import { NoteControls } from "@/features/blog/notes/components/NoteControls";
import { NoteEditor } from "@/features/blog/notes/components/NoteEditor";
import { getNoteById } from "@/features/blog/notes/queries";
import { renderNoteBody } from "@/features/blog/server/render";

// waits for the session check like the layout (see layout.tsx)
export const instant = false;

export const metadata: Metadata = { title: "Edit note" };

export default async function EditNotePage({ params }: PageProps<"/admin/notes/[id]">) {
  const [{ id }] = await Promise.all([params, requireAdminSection("notes")]);
  const note = await getNoteById(id);
  if (!note) notFound();
  const preview = await renderNoteBody(note.slug, note.body_md);
  return (
    <>
      <PageIntro kicker="Admin · Notes" title={note.title}>
        Editing /blog/{note.slug}. <Link href="/admin/notes">Back to notes</Link>
      </PageIntro>
      <section className={styles.sec} aria-label="Editor">
        <NoteControls
          id={note.id}
          title={note.title}
          slug={note.slug}
          status={note.status}
          visibility={note.visibility}
        />
        <NoteEditor
          note={{
            id: note.id,
            slug: note.slug,
            title: note.title,
            summary: note.summary,
            bodyMd: note.body_md,
            tags: note.tags,
            visibility: note.visibility,
          }}
          savedPreview={preview}
        />
      </section>
    </>
  );
}
