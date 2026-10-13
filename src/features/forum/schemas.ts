import { z } from "zod";
import { isCategorySlug, parseThreadId } from "./format";

/** Same limits as the check constraints on app.threads and app.replies (in code points). */
export const TITLE_MIN = 3;
export const TITLE_MAX = 140;
export const BODY_MAX = 20_000;

const codePoints = (s: string) => [...s].length;

/**
 * Markdown as typed: browsers submit textarea line breaks as CRLF, Postgres text can't hold NUL,
 * and surrounding blank space means nothing. Stored raw otherwise; rendering sanitises it.
 */
export const normaliseBody = (s: string) => s.replace(/\r\n?/g, "\n").replaceAll("\0", "").trim();

/** A title is one line: runs of whitespace (including line breaks) become one space. */
export const normaliseTitle = (s: string) => s.replaceAll("\0", "").replace(/\s+/g, " ").trim();

const text = z.string("Enter some text.");

export const titleSchema = text
  .transform(normaliseTitle)
  .refine((s) => codePoints(s) >= TITLE_MIN, `Use at least ${TITLE_MIN} characters for the title.`)
  .refine((s) => codePoints(s) <= TITLE_MAX, `Keep the title to ${TITLE_MAX} characters.`);

export const bodySchema = text
  .transform(normaliseBody)
  .refine((s) => s.length > 0, "Write a message.")
  .refine((s) => codePoints(s) <= BODY_MAX, `Keep the message to ${BODY_MAX} characters.`);

// a content id as it appears in a URL: digits only, a positive bigint
const idSchema = (message: string) =>
  z.string(message).refine((s) => parseThreadId(s) !== null, message);

const threadId = idSchema("Unknown thread.");
const postId = idSchema("Unknown post.");

export const newThreadSchema = z.object({
  category: z.string("Pick a category.").refine(isCategorySlug, "Pick a category."),
  title: titleSchema,
  body: bodySchema,
});

export const replySchema = z.object({ threadId, body: bodySchema });

export const postKindSchema = z.enum(["thread", "reply"], "Unknown post.");
export type PostKind = z.infer<typeof postKindSchema>;

export const postRefSchema = z.object({ kind: postKindSchema, id: postId });

export const editSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("thread"), id: postId, title: titleSchema, body: bodySchema }),
    z.object({ kind: z.literal("reply"), id: postId, body: bodySchema }),
  ],
  "Unknown post.",
);

/** The form field each schema path belongs to, for aria-invalid and the error's placement */
export type PostField = "category" | "title" | "body";

export function fieldOf(path: readonly PropertyKey[]): PostField | undefined {
  const f = path[0];
  return f === "category" || f === "title" || f === "body" ? f : undefined;
}
