import { z } from "zod";

/** Folder names under content/blog become URLs: lowercase words joined by single hyphens. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase words joined by hyphens");

/** Git post frontmatter (application.md 9.2); a bad field fails the build. */
export const frontmatterSchema = z
  .object({
    title: z.string().trim().min(1),
    date: z.iso.date(),
    summary: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).min(1),
    visibility: z.enum(["public", "unlisted"]).default("public"),
    draft: z.boolean().default(false),
    updated: z.iso.date().optional(),
  })
  .strict();

export type Frontmatter = z.infer<typeof frontmatterSchema>;
