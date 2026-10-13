import type { Route } from "next";
import { HANDLE_RE } from "@/features/auth/handle";
import { threadHref } from "@/features/forum/format";
import type { ProfilePost } from "./types";

/** Client-safe profile helpers: URLs, the cache tag and URL parsing. */

/** Posts listed on a profile; v1 has no pagination. */
export const RECENT_POSTS = 20;

export const profileHref = (handle: string) => `/u/${encodeURIComponent(handle)}` as Route;

/** Cache tag of one member's profile. Keyed by user id, which never leaves the server. */
export const profileTag = (userId: string) => `profile:${userId}`;

/** A handle as written in a URL, or null when it can't be one (same rule as the database check). */
export const parseHandle = (raw: string): string | null => (HANDLE_RE.test(raw) ? raw : null);

/** Where a listed post lives: the thread, or the reply's frame in it. */
export function postHref(post: ProfilePost): Route {
  const thread = threadHref(post.category.slug, post.threadId);
  return post.kind === "thread" ? thread : (`${thread}#reply-${post.id}` as Route);
}
