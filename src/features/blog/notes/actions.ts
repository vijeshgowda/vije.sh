"use server";

import type { ReactNode } from "react";
import type { Route } from "next";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_SECTIONS } from "@/features/admin/sections";
import { getCurrentUser } from "@/features/auth/session";
import { can } from "@/lib/authz";
import { renderNotePreview } from "../server/render";
import {
  createNote,
  deleteNote,
  NoteSlugTakenError,
  publishNote,
  unpublishNote,
  updateNote,
} from "./mutations";
import { GIT_SLUG_MESSAGE, noteIdSchema, noteInputSchema, type NoteInput } from "./schemas";
import { noteTags } from "./tags";

/**
 * The owner's note editor (application.md 9): parse -> current user -> can() with the notes
 * section's action ("blog.write") -> mutation -> updateTag(noteTags(...)). updateTag, not
 * revalidateTag: the owner usually opens
 * /blog right after publishing and should see the change, not a stale page. Drafts and private
 * notes are never in a cached read, so saving one only refreshes the editor.
 */

export type NoteField = keyof NoteInput;

export interface NoteFormState {
  error?: string;
  field?: NoteField;
  /** Set after a successful save, so the form can announce it */
  message?: string;
}

export interface NotePreviewState {
  error?: string;
  /** The Markdown the preview was rendered from */
  source?: string;
  body?: ReactNode;
}

export interface NoteStatusState {
  error?: string;
  message?: string;
}

const DENIED = "Only the site owner can edit notes.";
const MISSING = "This note no longer exists.";

const LABELS: Record<NoteField, string> = {
  slug: "Slug",
  title: "Title",
  summary: "Summary",
  bodyMd: "Body",
  tags: "Tags",
  visibility: "Visibility",
};

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : undefined;
};

function parseNote(formData: FormData) {
  return noteInputSchema.safeParse({
    slug: field(formData, "slug") ?? "",
    title: field(formData, "title") ?? "",
    summary: field(formData, "summary"),
    bodyMd: field(formData, "bodyMd") ?? "",
    tags: field(formData, "tags") ?? "",
    visibility: field(formData, "visibility") || undefined,
  });
}

function parseId(formData: FormData): string | null {
  const parsed = noteIdSchema.safeParse(field(formData, "id"));
  return parsed.success ? parsed.data : null;
}

async function owner() {
  const user = await getCurrentUser();
  return user && can(user, ADMIN_SECTIONS.notes.action) ? user : null;
}

function slugTaken(err: unknown): NoteFormState | null {
  if (!(err instanceof NoteSlugTakenError)) return null;
  return {
    field: "slug",
    error: err.by === "git" ? `Slug ${GIT_SLUG_MESSAGE}.` : "Slug is already used by another note.",
  };
}

function refreshTags(...slugs: (string | null | undefined)[]) {
  for (const tag of noteTags(...slugs)) updateTag(tag);
}

/** Creates a draft and opens it in the editor. */
export async function createNoteAction(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const parsed = parseNote(formData);
  if (!parsed.success) return invalid(parsed.error.issues[0]!);
  const user = await owner();
  if (!user) return { error: DENIED };

  let id: string;
  try {
    ({ id } = await createNote(user.id, parsed.data));
  } catch (err) {
    const taken = slugTaken(err);
    if (taken) return taken;
    throw err;
  }
  redirect(`/admin/notes/${id}` as Route);
}

/** Saves the editor. A published note is refreshed everywhere, under its old and new slug. */
export async function updateNoteAction(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  const parsed = parseNote(formData);
  if (!parsed.success) return invalid(parsed.error.issues[0]!);
  if (!(await owner())) return { error: DENIED };

  try {
    const saved = await updateNote(id, parsed.data);
    if (!saved) return { error: MISSING };
    if (saved.status === "published") refreshTags(saved.slug, saved.previousSlug);
  } catch (err) {
    const taken = slugTaken(err);
    if (taken) return taken;
    throw err;
  }
  refresh();
  return { message: "Saved." };
}

/** Renders the editor's unsaved body through the sanitised pipeline. Nothing is stored. */
export async function previewNoteAction(
  _prev: NotePreviewState,
  formData: FormData,
): Promise<NotePreviewState> {
  const parsed = noteInputSchema.shape.bodyMd.safeParse(field(formData, "bodyMd") ?? "");
  if (!parsed.success) return { error: `Body ${parsed.error.issues[0]!.message}.` };
  if (!(await owner())) return { error: DENIED };
  return { source: parsed.data, body: await renderNotePreview(parsed.data) };
}

export async function publishNoteAction(
  _prev: NoteStatusState,
  formData: FormData,
): Promise<NoteStatusState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  if (!(await owner())) return { error: DENIED };
  try {
    const done = await publishNote(id);
    if (!done) return { error: MISSING };
    refreshTags(done.slug);
  } catch (err) {
    const taken = slugTaken(err);
    if (taken) return { error: `${taken.error} Change it before publishing.` };
    throw err;
  }
  refresh();
  return { message: "Published." };
}

export async function unpublishNoteAction(
  _prev: NoteStatusState,
  formData: FormData,
): Promise<NoteStatusState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  if (!(await owner())) return { error: DENIED };
  const done = await unpublishNote(id);
  if (!done) return { error: MISSING };
  refreshTags(done.slug);
  refresh();
  return { message: "Moved back to drafts." };
}

/** Deletes a note (after the editor's confirmation dialog) and returns to the list. */
export async function deleteNoteAction(
  _prev: NoteStatusState,
  formData: FormData,
): Promise<NoteStatusState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  if (!(await owner())) return { error: DENIED };
  const done = await deleteNote(id);
  if (!done) return { error: MISSING };
  refreshTags(done.slug);
  redirect("/admin/notes");
}

function invalid(issue: { path: PropertyKey[]; message: string }): NoteFormState {
  const name = issue.path[0] as NoteField;
  return { field: name, error: `${LABELS[name]} ${issue.message}.` };
}
