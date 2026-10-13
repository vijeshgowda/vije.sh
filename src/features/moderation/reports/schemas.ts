import { z } from "zod";
import { HANDLE_RE } from "@/features/auth/handle";
import { parseThreadId } from "@/features/forum/format";
import { DETAILS_MAX, REASON_VALUES, RESOLVE_MAX } from "./format";

const contentId = (message: string) =>
  z.string(message).refine((s) => parseThreadId(s) !== null, message);

/** Optional details, trimmed; empty means none (null) */
const detailsSchema = z
  .string("Enter some text.")
  .transform((s) => s.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim())
  .refine((s) => [...s].length <= DETAILS_MAX, `Keep the details to ${DETAILS_MAX} characters.`)
  .transform((s) => s || null)
  .optional()
  .transform((s) => s ?? null);

/** What is reported: a thread (frame 00) or a reply by id, or a member by handle */
export const reportTargetSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("thread"), id: contentId("Unknown post.") }),
    z.object({ kind: z.literal("reply"), id: contentId("Unknown post.") }),
    z.object({
      kind: z.literal("profile"),
      handle: z.string("Unknown member.").regex(HANDLE_RE, "Unknown member."),
    }),
  ],
  "Unknown post.",
);
export type ReportTarget = z.infer<typeof reportTargetSchema>;

export const reportSchema = z
  .object({
    target: reportTargetSchema,
    reason: z.enum(REASON_VALUES, "Pick a reason."),
    details: detailsSchema,
  })
  .refine((r) => r.reason !== "other" || r.details !== null, {
    message: "Tell us what's wrong.",
    path: ["details"],
  });
export type ReportInput = z.infer<typeof reportSchema>;

/** Resolves one target's open reports (the ids the reviewer saw) */
export const resolveSchema = z.object({
  ids: z
    .array(contentId("Unknown report."), "Unknown report.")
    .min(1, "Unknown report.")
    .max(RESOLVE_MAX, "Too many reports at once.")
    .transform((ids) => [...new Set(ids)]),
  status: z.enum(["actioned", "dismissed"], "Unknown status."),
});

/** /admin/log?page=N; anything else is page 1 */
export const logQuerySchema = z.object({
  page: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.coerce.number().int().min(1).max(100_000))
    .catch(1),
});
