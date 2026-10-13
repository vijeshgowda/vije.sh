import { z } from "zod";
import { isCategorySlug, parseThreadId } from "@/features/forum/format";
import { postKindSchema } from "@/features/forum/schemas";

/** Same limit as the `app.moderation_log.note` check constraint (in code points) */
export const NOTE_MAX = 1000;

const contentId = (message: string) =>
  z.string(message).refine((s) => parseThreadId(s) !== null, message);

/** An optional reason for the log, trimmed; empty means none (null) */
export const noteSchema = z
  .string("Enter some text.")
  .transform((s) => s.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim())
  .refine((s) => [...s].length <= NOTE_MAX, `Keep the reason to ${NOTE_MAX} characters.`)
  .transform((s) => s || null)
  .optional();

/** A thread (frame 00) or a reply */
export const targetSchema = z.object({ kind: postKindSchema, id: contentId("Unknown post.") });
export type Target = z.infer<typeof targetSchema>;

export const hideSchema = targetSchema.extend({ note: noteSchema });

export const threadRefSchema = z.object({ id: contentId("Unknown thread.") });

/** Lock or pin on (true) or off (false) */
export const toggleSchema = threadRefSchema.extend({ on: z.boolean("Unknown state.") });

export const moveSchema = threadRefSchema.extend({
  category: z.string("Pick a category.").refine(isCategorySlug, "Pick a category."),
});
