import { z } from "zod";
import { handleSchema } from "@/features/auth/schemas";
import { BAN_DURATIONS, STAFF_ROLES } from "./members";

/** A searchParams value: the first one when the key is repeated. */
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** /admin/members?q=&page=; anything malformed falls back to "everyone, page 1". */
export const membersQuerySchema = z.object({
  q: z
    .preprocess(first, z.string())
    .transform((s) => s.trim().slice(0, 60))
    .catch(""),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(100_000)).catch(1),
});
export type MembersQuery = z.infer<typeof membersQuerySchema>;

/** A category id (bigint, as a string), or "" / missing for "every category". */
const categoryIdSchema = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z
    .string()
    .regex(/^[1-9]\d{0,17}$/, "Pick a category.")
    .nullable(),
);

/** Grant or revoke a staff role. Never `admin`: the owner is granted by hand in SQL. */
export const roleChangeSchema = z
  .object({
    handle: handleSchema,
    role: z.enum(STAFF_ROLES, "Pick a role."),
    categoryId: categoryIdSchema,
  })
  .refine((d) => d.role === "moderator" || d.categoryId === null, {
    message: "Only moderators can be limited to one category.",
    path: ["categoryId"],
  });
export type RoleChangeInput = z.infer<typeof roleChangeSchema>;

const banDays = BAN_DURATIONS.map((d) => d.value) as [string, ...string[]];

export const banSchema = z.object({
  handle: handleSchema,
  reason: z
    .string("Give a reason.")
    .trim()
    .min(1, "Give a reason.")
    .max(500, "Keep the reason to 500 characters."),
  /** Ban length in days, or null for permanent */
  days: z.enum(banDays, "Pick how long the ban lasts.").transform((v) => (v ? Number(v) : null)),
});
export type BanInput = z.infer<typeof banSchema>;

export const liftBanSchema = z.object({ handle: handleSchema });
