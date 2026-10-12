import { z } from "zod";
import { slugSchema } from "../schemas";
import manifest from "./git-slugs.json";

/** Limits from the app.posts check constraints (0001_init.sql), plus a few of our own. */
export const NOTE_LIMITS = {
  slug: 100,
  title: 200,
  summary: 300,
  body: 100_000,
  tags: 8,
  tag: 40,
} as const;

export const VISIBILITIES = ["public", "unlisted", "private"] as const;

/** Slugs of every git post (content/blog/<slug>/), from the generated manifest. */
export const GIT_SLUGS: ReadonlySet<string> = new Set(manifest.slugs);

export function isGitSlug(slug: string, gitSlugs: ReadonlySet<string> = GIT_SLUGS): boolean {
  return gitSlugs.has(slug);
}

export const GIT_SLUG_MESSAGE = "is already used by a post in content/blog";

/** A note slug: the same shape as a git post folder name, and never one of theirs. */
export const noteSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(NOTE_LIMITS.slug, `must be at most ${NOTE_LIMITS.slug} characters`)
  .pipe(slugSchema)
  .refine((s) => !isGitSlug(s), GIT_SLUG_MESSAGE);

/** Content ids are bigint, which pg returns as strings (database.md section 8). */
export const noteIdSchema = z.string().regex(/^[1-9][0-9]{0,17}$/, "must be a note id");

/** Tags as an array or a comma-separated form field; trimmed, without blanks or duplicates. */
export const tagsSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => {
    const raw = typeof v === "string" ? v.split(",") : v;
    return [...new Set(raw.map((t) => t.trim()).filter(Boolean))];
  })
  .pipe(
    z
      .array(
        z
          .string()
          .max(NOTE_LIMITS.tag, `each tag must be at most ${NOTE_LIMITS.tag} characters`)
          .refine((t) => !t.includes(","), "tags can't contain commas"),
      )
      .max(NOTE_LIMITS.tags, `at most ${NOTE_LIMITS.tags} tags`),
  );

/** Create and update input for a note (owner-only editor, part 2). New notes start as drafts. */
export const noteInputSchema = z.object({
  slug: noteSlugSchema,
  title: z.string().trim().min(1, "is required").max(NOTE_LIMITS.title),
  // Empty form fields mean "no summary".
  summary: z
    .string()
    .trim()
    .max(NOTE_LIMITS.summary)
    .nullish()
    .transform((s) => s || null),
  bodyMd: z
    .string()
    .max(NOTE_LIMITS.body)
    .transform((s) => s.replace(/\r\n?/g, "\n")),
  tags: tagsSchema.default([]),
  visibility: z.enum(VISIBILITIES).default("public"),
});

export type NoteInput = z.output<typeof noteInputSchema>;
export type NoteFormInput = z.input<typeof noteInputSchema>;
