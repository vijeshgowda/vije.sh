"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import type { SessionUser } from "@/features/auth/queries";
import { can, isMember, moderates } from "@/lib/authz";
import { threadHref } from "./format";
import type { EditSource, PostFormState } from "./form-state";
import { LIMITS, limitError } from "./limits";
import { insertReply, insertThread, updateReply, updateThread } from "./mutations";
import {
  categoryForPost,
  categoryTag,
  countRecentReplies,
  countRecentThreads,
  postForEdit,
  threadForReply,
  threadTag,
} from "./queries";
import { editSchema, fieldOf, newThreadSchema, postRefSchema, replySchema } from "./schemas";

/**
 * Forum writes, each in the standard order (application.md 6): parse -> current user -> can() ->
 * rate limit -> mutation -> updateTag. updateTag (not revalidateTag) so the author's next read,
 * including the page re-rendered with this response, already shows the change.
 */

const NOT_AVAILABLE = "This thread is no longer available.";
const POST_GONE = "This post is no longer available.";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Why a signed-in-or-not user can't post at all, or null for a member */
function cantPost(user: SessionUser | null): string | null {
  if (!user) return "Sign in to post.";
  if (!user.onboarded) return "Finish signing up before you post.";
  if (user.banned) return "Your account can't post.";
  return null;
}

function invalid(seq: number, error: z.ZodError, values: PostFormState["values"]): PostFormState {
  const issue = error.issues[0]!;
  return { seq, error: issue.message, field: fieldOf(issue.path), values };
}

/** New thread dialog. Redirects to the new thread on success. */
export async function createThread(prev: PostFormState, form: FormData): Promise<PostFormState> {
  const seq = prev.seq + 1;
  const values = {
    category: str(form.get("category")),
    title: str(form.get("title")),
    body: str(form.get("body")),
  };
  const parsed = newThreadSchema.safeParse({
    category: form.get("category"),
    title: form.get("title"),
    body: form.get("body"),
  });
  if (!parsed.success) return invalid(seq, parsed.error, values);
  const { title, body } = parsed.data;

  const user = await getCurrentUser();
  if (!isMember(user)) return { seq, error: cantPost(user)!, values };
  const category = await categoryForPost(parsed.data.category);
  if (!category) return { seq, error: "Pick a category.", field: "category", values };
  const staffOnly = `Only staff can start threads in ${category.name}.`;
  if (!can(user, "thread.create", { categoryId: category.id, staffOnly: category.staffOnly })) {
    return { seq, error: staffOnly, field: "category", values };
  }

  const recent = await countRecentThreads(user.id, LIMITS.thread.windowMs);
  const limited = limitError("thread", user, recent, new Date());
  if (limited) return { seq, error: limited, values };

  const id = await insertThread({
    categoryId: category.id,
    authorId: user.id,
    title,
    body,
    staff: moderates(user, category.id),
  });
  if (!id) return { seq, error: staffOnly, field: "category", values };

  updateTag(categoryTag(category.slug));
  redirect(threadHref(category.slug, id));
}

/** The reply form under a thread. */
export async function createReply(prev: PostFormState, form: FormData): Promise<PostFormState> {
  const seq = prev.seq + 1;
  const values = { body: str(form.get("body")) };
  const parsed = replySchema.safeParse({ threadId: form.get("threadId"), body: form.get("body") });
  if (!parsed.success) return invalid(seq, parsed.error, values);
  const { threadId, body } = parsed.data;

  const user = await getCurrentUser();
  if (!isMember(user)) return { seq, error: cantPost(user)!, values };
  const thread = await threadForReply(threadId);
  if (!thread) return { seq, error: NOT_AVAILABLE, values };
  const locked = "This thread is locked.";
  if (!can(user, "reply.create", { categoryId: thread.categoryId, locked: thread.locked })) {
    return { seq, error: locked, values };
  }

  const recent = await countRecentReplies(user.id, LIMITS.reply.windowMs);
  const limited = limitError("reply", user, recent, new Date());
  if (limited) return { seq, error: limited, values };

  const id = await insertReply({
    threadId,
    authorId: user.id,
    body,
    staff: moderates(user, thread.categoryId),
  });
  // locked or hidden since the check above
  if (!id) return { seq, error: "This thread is locked or no longer available.", values };

  updateTag(threadTag(threadId));
  updateTag(categoryTag(thread.categorySlug));
  return { seq, ok: true, id };
}

type Loaded =
  | { error: string }
  | { post: NonNullable<Awaited<ReturnType<typeof postForEdit>>>; user: SessionUser };

/** The current user and the post, if they may edit it now (post.edit_own: 30 minutes, or the owner) */
async function editable(kind: "thread" | "reply", id: string): Promise<Loaded> {
  const user = await getCurrentUser();
  if (!isMember(user)) return { error: cantPost(user)! };
  const post = await postForEdit(kind, id);
  if (!post) return { error: POST_GONE };
  const ctx = { authorId: post.authorId, createdAt: post.createdAt, now: new Date() };
  if (!can(user, "post.edit_own", ctx)) {
    return {
      error:
        post.authorId === user.id
          ? "The 30-minute edit window has closed."
          : "You can only edit your own posts.",
    };
  }
  return { post, user };
}

/** The stored Markdown (and title) for the edit dialog; same rule as editPost. */
export async function loadEditSource(ref: { kind: string; id: string }): Promise<EditSource> {
  const parsed = postRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: POST_GONE };
  const r = await editable(parsed.data.kind, parsed.data.id);
  if ("error" in r) return { ok: false, error: r.error };
  return { ok: true, title: r.post.title, body: r.post.body };
}

/** Edit own thread (title and opening post) or reply. No rate limit (application.md 10.3). */
export async function editPost(prev: PostFormState, form: FormData): Promise<PostFormState> {
  const seq = prev.seq + 1;
  const values = { title: str(form.get("title")), body: str(form.get("body")) };
  const parsed = editSchema.safeParse({
    kind: form.get("kind"),
    id: form.get("id"),
    title: form.get("title") ?? undefined,
    body: form.get("body"),
  });
  if (!parsed.success) return invalid(seq, parsed.error, values);
  const input = parsed.data;

  const r = await editable(input.kind, input.id);
  if ("error" in r) return { seq, error: r.error, values };

  const saved =
    input.kind === "thread"
      ? await updateThread({ id: input.id, title: input.title, body: input.body })
      : await updateReply({ id: input.id, body: input.body });
  if (!saved) return { seq, error: POST_GONE, values };

  updateTag(threadTag(r.post.threadId));
  // a new title shows in the lists
  if (input.kind === "thread") updateTag(categoryTag(r.post.categorySlug));
  return { seq, ok: true };
}
