/** Client-safe auth helpers (no zod), shared by the server schemas and the client islands. */

import type { Route } from "next";

/** Same rule as the `app.profiles.handle` check constraint; uniqueness is case-insensitive. */
export const HANDLE_RE = /^[A-Za-z0-9_]{3,24}$/;

/**
 * A same-site path to send the user back to after sign-in, or `fallback`. Rejects absolute URLs,
 * protocol-relative `//host`, backslashes and anything else that would leave this origin.
 */
export function safeNext(raw: unknown, fallback: Route = "/"): Route {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  const base = "http://n.invalid";
  const url = new URL(raw, base);
  if (url.origin !== base) return fallback;
  return (url.pathname + url.search + url.hash) as Route;
}

/** A handle suggestion from a display name ("Ada Lovelace" -> "Ada_Lovelace"), or "". */
export function suggestHandle(name: string | null | undefined): string {
  const h = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)
    .replace(/_+$/, "");
  return HANDLE_RE.test(h) ? h : "";
}
