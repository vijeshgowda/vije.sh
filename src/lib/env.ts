import { z } from "zod";

/**
 * Environment variables, validated with zod. Each group is parsed the first time it's used, so the
 * site builds and runs before the database, auth or storage are configured; a feature that needs a
 * group fails fast with a clear message listing what's missing.
 */

const url = z.url({ protocol: /^https?$/ });

export function isLocalDatabase(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

const schemas = {
  site: z.object({
    NEXT_PUBLIC_SITE_URL: url.default("https://vije.sh"),
  }),
  database: z
    .object({
      DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
      // PEM text; Vercel and .env files often store newlines as \n
      DATABASE_CA_CERT: z
        .string()
        .min(1)
        .transform((s) => s.replace(/\\n/g, "\n"))
        .optional(),
    })
    .refine((v) => v.DATABASE_CA_CERT || isLocalDatabase(v.DATABASE_URL), {
      path: ["DATABASE_CA_CERT"],
      message: "required for any database that isn't on localhost",
    }),
  supabase: z.object({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  }),
  supabaseAdmin: z.object({
    SUPABASE_SECRET_KEY: z.string().min(1),
  }),
  turnstile: z.object({
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
  }),
  r2: z.object({
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    NEXT_PUBLIC_IMAGE_BASE_URL: url.default("https://img.vije.sh"),
  }),
  cron: z.object({
    CRON_SECRET: z.string().min(16),
  }),
} as const;

export type EnvGroup = keyof typeof schemas;
export type EnvSource = Record<string, string | undefined>;
export type Env<G extends EnvGroup> = z.infer<(typeof schemas)[G]>;

export class EnvError extends Error {
  constructor(group: string, issues: string[]) {
    super(`Missing or invalid environment variables for "${group}": ${issues.join("; ")}`);
    this.name = "EnvError";
  }
}

const cache = new Map<EnvGroup, unknown>();

export function env<G extends EnvGroup>(group: G, source: EnvSource = process.env): Env<G> {
  if (source === process.env && cache.has(group)) return cache.get(group) as Env<G>;
  const raw = Object.fromEntries(
    Object.keys(schemas[group].shape).map((k) => [k, source[k] === "" ? undefined : source[k]]),
  );
  const parsed = schemas[group].safeParse(raw);
  if (!parsed.success) {
    throw new EnvError(
      group,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  if (source === process.env) cache.set(group, parsed.data);
  return parsed.data as Env<G>;
}

/** True when every variable in the group is present and valid. */
export function hasEnv(group: EnvGroup, source: EnvSource = process.env): boolean {
  try {
    env(group, source);
    return true;
  } catch {
    return false;
  }
}

/**
 * AUTH_MODE=test swaps real sign-in for a signed test cookie (application.md 13.4). It must never
 * run on Vercel, which sets VERCEL on every build and deployment.
 */
export function assertAuthModeSafe(source: EnvSource = process.env): void {
  if (source.AUTH_MODE === "test" && source.VERCEL) {
    throw new EnvError("auth", ["AUTH_MODE=test is not allowed on Vercel"]);
  }
}
