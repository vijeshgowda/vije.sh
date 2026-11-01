/**
 * Page origins allowed to open a signalling WebSocket in production. Exact origins only: no
 * localhost, wildcards, paths or trailing slash. Browsers send the page's origin on the WebSocket
 * upgrade, and the server compares it with this list (Render has no CORS setting of its own).
 * `https://vijeshgowda.com` is the original GitHub Pages Omni, which shares this server.
 */
export const PRODUCTION_ORIGINS = Object.freeze(["https://vije.sh", "https://vijeshgowda.com"]);

/** True for a bare http(s) origin such as `https://vije.sh` or `http://localhost:3000`. */
export function isExactOrigin(value) {
  if (typeof value !== "string" || value.includes("*")) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

/**
 * The allow-list for this process. `override` is the optional comma-separated `ALLOWED_ORIGINS`
 * value (exact match). An empty or missing override means the committed production list, never
 * "allow every origin"; an entry that isn't an exact origin stops the server from starting.
 */
export function allowedOrigins(override) {
  const entries = (override ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (entries.length === 0) return [...PRODUCTION_ORIGINS];
  const invalid = entries.filter((origin) => !isExactOrigin(origin));
  if (invalid.length > 0) {
    throw new Error(
      `ALLOWED_ORIGINS must list exact origins such as https://vije.sh (no paths, wildcards or trailing slash): ${invalid.join(", ")}`,
    );
  }
  return [...new Set(entries)];
}

export function isAllowedOrigin(origin, allowed) {
  return typeof origin === "string" && allowed.includes(origin);
}
