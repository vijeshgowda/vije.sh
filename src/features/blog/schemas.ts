import { z } from "zod";

/** Folder names under content/blog become URLs: lowercase words joined by single hyphens. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase words joined by hyphens");

const FOLDER = /^(\d{4})-(.+)$/;

/**
 * A post folder is `NNNN-<slug>` (application.md 9.2): NNNN is the publish order (0001 first) and
 * breaks ties between posts with the same date; the slug after it is the URL. Throws on a bad name.
 */
export function parseFolder(name: string): { seq: number; slug: string } {
  const fail = (msg: string): never => {
    throw new Error(`content/blog/${name}: folder name ${msg}`);
  };
  const m =
    FOLDER.exec(name) ?? fail("must start with a 4-digit publish number, e.g. 0009-my-post");
  const seq = Number(m[1]);
  if (seq < 1) fail("publish numbers start at 0001");
  const s = slugSchema.safeParse(m[2]);
  if (!s.success) fail(`slug ${s.error.issues[0].message}`);
  return { seq, slug: m[2] };
}

/** Folders parsed in publish order; fails on a repeated publish number or slug. */
export function parseFolders(names: string[]): { folder: string; seq: number; slug: string }[] {
  const parsed = names.map((folder) => ({ folder, ...parseFolder(folder) }));
  for (const key of ["seq", "slug"] as const) {
    const seen = new Map<number | string, string>();
    for (const p of parsed) {
      const other = seen.get(p[key]);
      if (other) {
        throw new Error(
          `content/blog/${p.folder}: ${key === "seq" ? "publish number" : "slug"} already used by ${other}`,
        );
      }
      seen.set(p[key], p.folder);
    }
  }
  return parsed.sort((a, b) => a.seq - b.seq);
}

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
