import type { Provider } from "@supabase/supabase-js";

/**
 * OAuth providers shown on /login, in order. Enable a provider in both Supabase projects before
 * adding it here (application.md 12.5). Microsoft is Supabase's `azure` provider (tenant `common`)
 * and needs the `email` scope.
 */
export const PROVIDERS = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "azure", label: "Microsoft", scopes: "email" },
  // { id: "discord", label: "Discord" },
  // { id: "gitlab", label: "GitLab" },
] as const satisfies readonly { id: Provider; label: string; scopes?: string }[];

export type ProviderId = (typeof PROVIDERS)[number]["id"];
