"use server";

import { updateTag } from "next/cache";
import type { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import type { SessionUser } from "@/features/auth/queries";
import { threadHref } from "@/features/forum/format";
import { FORUM_TAG, categoryTag, threadTag } from "@/features/forum/queries";
import { can, isMember, moderates, type Action } from "@/lib/authz";
import {
  moveThread as moveMutation,
  setHidden,
  setLocked,
  setPinned,
  type Outcome,
} from "./mutations";
import {
  categoryBySlug,
  hiddenSource,
  hiddenThread as loadHiddenThread,
  listCategoryOptions,
  targetForModeration,
  type ModerationTarget,
} from "./queries";
import { hideSchema, moveSchema, targetSchema, threadRefSchema, toggleSchema } from "./schemas";
import type {
  HiddenThreadResult,
  ModerationResult,
  MoveTargetsResult,
  RevealResult,
} from "./results";

/**
 * Inline moderation (application.md 8.7: hide/unhide, lock, pin, move for moderators in scope,
 * superusers and the owner). Each action runs in the standard order: parse -> current user ->
 * can() for the post's category (both categories for a move) -> mutation with its log row ->
 * updateTag. Staff aren't rate limited. Islands call these directly (no form state).
 *
 * Tags: a reply, lock or pin changes one thread page and its category's list (the /forum list is
 * tagged with every category); hiding, unhiding or moving a thread also changes which threads
 * exist at which URL, so it refreshes `forum` too (everything that lists threads by URL).
 */

const NOT_ALLOWED = "You can't moderate this post.";
const GONE = "This post is no longer available.";
const STALE = "This post changed since the page loaded. Reload and try again.";

/** A signed-in member with any staff grant. Everyone else is refused before any lookup. */
async function staffUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return isMember(user) && user.roles.length > 0 ? user : null;
}

const fail = (error: string) => ({ ok: false as const, error });
const firstIssue = (e: z.ZodError) => fail(e.issues[0]!.message);

type Checked = { error: string } | { user: SessionUser; target: ModerationTarget };

/** The current staff user and the post, if they may take `action` on it */
async function authorise(action: Action, kind: "thread" | "reply", id: string): Promise<Checked> {
  const user = await staffUser();
  if (!user) return { error: NOT_ALLOWED };
  const target = await targetForModeration(kind, id);
  if (!target) return { error: GONE };
  if (!can(user, action, { categoryId: target.categoryId })) return { error: NOT_ALLOWED };
  return { user, target };
}

/** Refreshes what a change to this post touched */
function refresh(target: ModerationTarget, threadLevel: boolean) {
  if (threadLevel) updateTag(FORUM_TAG);
  updateTag(categoryTag(target.categorySlug));
  updateTag(threadTag(target.threadId));
}

function answer(outcome: Outcome, target: ModerationTarget, threadLevel: boolean, message: string) {
  if (outcome === "stale") return fail(STALE);
  refresh(target, threadLevel);
  return { ok: true as const, message };
}

const noun = (kind: "thread" | "reply") => (kind === "thread" ? "Thread" : "Reply");

/** Hides a thread (404 for everyone but its staff) or a reply (a placeholder), with an optional reason. */
export async function hidePost(input: unknown): Promise<ModerationResult> {
  const parsed = hideSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { kind, id, note } = parsed.data;
  const r = await authorise("post.hide", kind, id);
  if ("error" in r) return fail(r.error);
  const outcome = await setHidden({
    kind,
    id,
    categoryId: r.target.categoryId,
    actorId: r.user.id,
    hidden: true,
    note,
  });
  return answer(outcome, r.target, kind === "thread", `${noun(kind)} hidden`);
}

/** Shows a hidden thread or reply again. Exported for the moderation log (PR9) as well. */
export async function unhidePost(input: unknown): Promise<ModerationResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { kind, id } = parsed.data;
  const r = await authorise("post.hide", kind, id);
  if ("error" in r) return fail(r.error);
  const outcome = await setHidden({
    kind,
    id,
    categoryId: r.target.categoryId,
    actorId: r.user.id,
    hidden: false,
  });
  return answer(outcome, r.target, kind === "thread", `${noun(kind)} visible again`);
}

/**
 * The stored Markdown of a hidden thread or reply, for staff in scope. Plain text only: the island
 * shows it in a <pre>, never as HTML. Reading isn't a change, so it isn't logged (see the PR notes).
 */
export async function revealPost(input: unknown): Promise<RevealResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { kind, id } = parsed.data;
  const r = await authorise("post.hide", kind, id);
  if ("error" in r) return fail(r.error);
  const source = await hiddenSource(kind, id);
  if (!source) return fail("This post isn't hidden any more.");
  return { ok: true, ...source };
}

/**
 * For the 404 page of a hidden thread: its title and category, if the visitor moderates it. Anyone
 * else gets `{ ok: false }` whether or not the thread exists.
 */
export async function hiddenThread(input: unknown): Promise<HiddenThreadResult> {
  const parsed = threadRefSchema.safeParse(input);
  const user = parsed.success ? await staffUser() : null;
  if (!parsed.success || !user) return { ok: false };
  const thread = await loadHiddenThread(parsed.data.id);
  if (!thread || !can(user, "post.hide", { categoryId: thread.categoryId })) return { ok: false };
  return {
    ok: true,
    thread: {
      id: thread.id,
      title: thread.title,
      categoryName: thread.categoryName,
      hiddenAt: thread.hiddenAt.toISOString(),
    },
  };
}

async function toggle(
  action: "thread.lock" | "thread.pin",
  input: unknown,
): Promise<ModerationResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { id, on } = parsed.data;
  const r = await authorise(action, "thread", id);
  if ("error" in r) return fail(r.error);
  const change = { threadId: id, categoryId: r.target.categoryId, actorId: r.user.id, on };
  if (action === "thread.lock") {
    return answer(
      await setLocked(change),
      r.target,
      false,
      on ? "Thread locked" : "Thread unlocked",
    );
  }
  return answer(await setPinned(change), r.target, false, on ? "Thread pinned" : "Thread unpinned");
}

/** Locks (`on: true`) or unlocks a thread. Staff can still reply to a locked thread. */
export async function lockThread(input: unknown): Promise<ModerationResult> {
  return toggle("thread.lock", input);
}

/** Pins (`on: true`, listed first in its category) or unpins a thread. */
export async function pinThread(input: unknown): Promise<ModerationResult> {
  return toggle("thread.pin", input);
}

/** The categories this user may move the thread to: ones they moderate, except its own. */
export async function moveTargets(input: unknown): Promise<MoveTargetsResult> {
  const parsed = threadRefSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const r = await authorise("thread.move", "thread", parsed.data.id);
  if ("error" in r) return fail(r.error);
  const all = await listCategoryOptions();
  const categories = all
    .filter((c) => c.id !== r.target.categoryId && moderates(r.user, c.id))
    .map(({ slug, name }) => ({ slug, name }));
  return { ok: true, categories };
}

/**
 * Moves a thread to another category; the moderator must moderate both. Answers with the new
 * canonical URL for the island to go to; the old URL keeps working, because the thread page
 * redirects any wrong category to the canonical one.
 */
export async function moveThread(input: unknown): Promise<ModerationResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  const { id, category } = parsed.data;
  const r = await authorise("thread.move", "thread", id);
  if ("error" in r) return fail(r.error);
  const dest = await categoryBySlug(category);
  if (!dest) return fail("Pick a category.");
  if (!can(r.user, "thread.move", { categoryId: dest.id })) {
    return fail(`You can't move threads into ${dest.name}.`);
  }
  if (dest.id === r.target.categoryId) return fail(`This thread is already in ${dest.name}.`);

  const outcome = await moveMutation({
    threadId: id,
    from: { id: r.target.categoryId, slug: r.target.categorySlug },
    to: { id: dest.id, slug: dest.slug },
    actorId: r.user.id,
  });
  if (outcome === "stale") return fail(STALE);
  refresh(r.target, true);
  updateTag(categoryTag(dest.slug));
  return { ok: true, message: `Thread moved to ${dest.name}`, href: threadHref(dest.slug, id) };
}
