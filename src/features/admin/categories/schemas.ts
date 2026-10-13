import { z } from "zod";

/** Limits from the app.categories check constraints (0001_init.sql), plus a slug limit of our own. */
export const CATEGORY_LIMITS = { slug: 40, name: 60, description: 300 } as const;

/**
 * Words a category can't use as its slug: they would read as part of the forum's own URLs
 * (`/forum/<slug>`) if the forum ever adds such a page.
 */
export const RESERVED_CATEGORY_SLUGS: ReadonlySet<string> = new Set([
  "all",
  "latest",
  "new",
  "search",
]);

/**
 * A category slug is its URL (`/forum/<slug>`, and every thread under it), so it is set once at
 * creation and never edited: renaming changes only the display name.
 */
export const categorySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "is required")
  .max(CATEGORY_LIMITS.slug, `must be at most ${CATEGORY_LIMITS.slug} characters`)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase words joined by hyphens")
  .refine((s) => !RESERVED_CATEGORY_SLUGS.has(s), "is reserved for the forum");

/** Category ids are bigint, which pg returns as strings (database.md section 8). */
export const categoryIdSchema = z.string().regex(/^[1-9][0-9]{0,17}$/, "must be a category id");

const nameSchema = z
  .string()
  .trim()
  .min(1, "is required")
  .max(CATEGORY_LIMITS.name, `must be at most ${CATEGORY_LIMITS.name} characters`);

// Empty form fields mean "no description".
const descriptionSchema = z
  .string()
  .trim()
  .max(CATEGORY_LIMITS.description, `must be at most ${CATEGORY_LIMITS.description} characters`)
  .nullish()
  .transform((s) => s || null);

/** What a rename can change: the name and the description, never the slug. */
export const categoryDetailsSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
});

export const newCategorySchema = categoryDetailsSchema.extend({
  slug: categorySlugSchema,
  staffOnly: z.boolean().default(false),
});

export const MOVES = ["up", "down"] as const;
export const moveSchema = z.enum(MOVES);

export type CategoryDetails = z.output<typeof categoryDetailsSchema>;
export type NewCategory = z.output<typeof newCategorySchema>;
export type Move = z.output<typeof moveSchema>;

/** A slug suggested from a name for a new category: "Local AI" -> "local-ai". */
export function suggestCategorySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, CATEGORY_LIMITS.slug)
    .replace(/^-+|-+$/g, "");
}
