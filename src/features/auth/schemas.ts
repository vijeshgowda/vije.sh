import { z } from "zod";
import { safeUrl } from "@/features/live/format";
import { HANDLE_RE, safeNext } from "./handle";
import { PROVIDERS } from "./providers";

export const handleSchema = z
  .string()
  .trim()
  .regex(HANDLE_RE, "Use 3 to 24 letters, digits or underscores.");

export const providerSchema = z.enum(PROVIDERS.map((p) => p.id) as [string, ...string[]]);

export const signInSchema = z.object({
  provider: providerSchema,
  next: z.unknown().transform((v) => safeNext(v)),
});

export const welcomeSchema = z.object({
  handle: handleSchema,
  accept: z.literal("on", "Please accept the community guidelines."),
  token: z.string().min(1, "Please complete the human check.").max(2048),
  next: z.unknown().transform((v) => safeNext(v)),
});

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Display name and avatar from the provider's user_metadata. The user can edit that metadata, so
 * it's only ever a prefill: clipped to the column limits, avatar restricted to http(s).
 */
export function profileFromMetadata(meta: Record<string, unknown> | undefined) {
  const m = meta ?? {};
  const name = str(m.full_name) ?? str(m.name) ?? str(m.user_name) ?? str(m.preferred_username);
  const avatar = safeUrl(m.avatar_url) ?? safeUrl(m.picture);
  return {
    displayName: name ? name.slice(0, 60) : null,
    avatarUrl: avatar && avatar.length <= 500 ? avatar : null,
  };
}
