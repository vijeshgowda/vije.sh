"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { categoryTag, FORUM_TAG } from "@/features/forum/queries";
import { can } from "@/lib/authz";
import { ADMIN_SECTIONS } from "../sections";
import {
  CategorySlugTakenError,
  createCategory,
  deleteCategory,
  moveCategory,
  setCategoryStaffOnly,
  updateCategory,
} from "./mutations";
import {
  categoryDetailsSchema,
  categoryIdSchema,
  moveSchema,
  newCategorySchema,
  type NewCategory,
} from "./schemas";

/**
 * The owner's category manager: parse -> current user -> can() with the categories section's
 * action ("category.manage") -> mutation (with its log row) -> updateTag(FORUM_TAG) and
 * updateTag(categoryTag(slug)), so the owner sees the forum change on the next visit, then
 * refresh() for the admin table itself.
 */

export type CategoryField = keyof Pick<NewCategory, "slug" | "name" | "description">;

export interface CategoryFormState {
  error?: string;
  field?: CategoryField;
  /** Set after a successful save, so the form can announce it */
  message?: string;
}

export interface CategoryRowState {
  error?: string;
  message?: string;
}

const DENIED = "Only the site owner can manage categories.";
const MISSING = "This category no longer exists.";
const NOT_EMPTY = "This category still has threads. Only empty categories can be deleted.";

const LABELS: Record<CategoryField, string> = {
  slug: "Slug",
  name: "Name",
  description: "Description",
};

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : undefined;
};

function parseId(formData: FormData): string | null {
  const parsed = categoryIdSchema.safeParse(field(formData, "id"));
  return parsed.success ? parsed.data : null;
}

async function owner() {
  const user = await getCurrentUser();
  return user && can(user, ADMIN_SECTIONS.categories.action) ? user : null;
}

function invalid(issue: { path: PropertyKey[]; message: string }): CategoryFormState {
  const name = issue.path[0] as CategoryField;
  return { field: name, error: `${LABELS[name]} ${issue.message}.` };
}

function refreshForum(slug: string) {
  updateTag(FORUM_TAG);
  updateTag(categoryTag(slug));
  refresh();
}

/** Adds a category at the end of the forum order. */
export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = newCategorySchema.safeParse({
    slug: field(formData, "slug") ?? "",
    name: field(formData, "name") ?? "",
    description: field(formData, "description"),
    staffOnly: formData.get("staffOnly") === "on",
  });
  if (!parsed.success) return invalid(parsed.error.issues[0]!);
  const user = await owner();
  if (!user) return { error: DENIED };

  try {
    const { slug } = await createCategory(user.id, parsed.data);
    refreshForum(slug);
  } catch (err) {
    if (err instanceof CategorySlugTakenError) {
      return { field: "slug", error: "Slug is already used by another category." };
    }
    throw err;
  }
  return { message: `Created ${parsed.data.name}.` };
}

/** Renames a category or edits its description; the slug stays. */
export async function updateCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  const parsed = categoryDetailsSchema.safeParse({
    name: field(formData, "name") ?? "",
    description: field(formData, "description"),
  });
  if (!parsed.success) return invalid(parsed.error.issues[0]!);
  const user = await owner();
  if (!user) return { error: DENIED };

  const saved = await updateCategory(user.id, id, parsed.data);
  if (!saved) return { error: MISSING };
  if (!saved.changed) return { message: "Nothing changed." };
  refreshForum(saved.slug);
  return { message: `Saved ${parsed.data.name}.` };
}

/** Moves a category one place up or down. */
export async function moveCategoryAction(
  _prev: CategoryRowState,
  formData: FormData,
): Promise<CategoryRowState> {
  const id = parseId(formData);
  const move = moveSchema.safeParse(field(formData, "direction"));
  if (!id || !move.success) return { error: MISSING };
  const user = await owner();
  if (!user) return { error: DENIED };

  const done = await moveCategory(user.id, id, move.data);
  if (!done) return { error: MISSING };
  if (!done.moved) return { message: `Already at the ${move.data === "up" ? "top" : "bottom"}.` };
  refreshForum(done.slug);
  return { message: `Moved ${move.data}.` };
}

const flagSchema = z.enum(["true", "false"]).transform((v) => v === "true");

/** Sets whether only staff start threads in a category (everyone still reads it). */
export async function setStaffOnlyAction(
  _prev: CategoryRowState,
  formData: FormData,
): Promise<CategoryRowState> {
  const id = parseId(formData);
  const staffOnly = flagSchema.safeParse(field(formData, "staffOnly"));
  if (!id || !staffOnly.success) return { error: MISSING };
  const user = await owner();
  if (!user) return { error: DENIED };

  const done = await setCategoryStaffOnly(user.id, id, staffOnly.data);
  if (!done) return { error: MISSING };
  if (done.changed) refreshForum(done.slug);
  return {
    message: staffOnly.data ? "Only staff start threads here now." : "Everyone can start threads.",
  };
}

/** Deletes an empty category (after the table's confirmation dialog). */
export async function deleteCategoryAction(
  _prev: CategoryRowState,
  formData: FormData,
): Promise<CategoryRowState> {
  const id = parseId(formData);
  if (!id) return { error: MISSING };
  const user = await owner();
  if (!user) return { error: DENIED };

  const done = await deleteCategory(user.id, id);
  if (!done) return { error: MISSING };
  if (done.status === "not-empty") return { error: NOT_EMPTY };
  refreshForum(done.slug);
  return { message: "Category deleted." };
}
