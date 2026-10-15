"use server";

import { refresh, revalidateTag } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { FORUM_TAG } from "@/features/forum/queries";
import type { SessionUser } from "@/features/auth/queries";
import { mayBan, mayGrant, mayRevoke, type Target } from "./members";
import {
  banUser,
  grantRole,
  liftBan,
  revokeRole,
  type MutationResult,
  type TargetCheck,
} from "./mutations";
import { actionFailed } from "./action-errors";
import { getTarget } from "./queries";
import { banSchema, liftBanSchema, roleChangeSchema } from "./schemas";

/** What a member-page form shows after submitting: a confirmation or an error. */
export interface AdminActionState {
  ok?: string;
  error?: string;
}

const REFUSED = "You can't change this member.";
const FAILED: Record<Exclude<MutationResult, "ok" | "unchanged">, string> = {
  forbidden: REFUSED,
  invalid: "That category no longer exists.",
};

const field = (f: FormData, name: string) => f.get(name) ?? undefined;

/**
 * The part every member action shares, after parsing: current user -> target -> can() ->
 * mutation (which re-checks under a row lock) -> refresh. Staff actions have no rate limit.
 * A mutation that throws becomes a form error, logged under `action`.
 */
async function act(
  action: string,
  handle: string,
  allowed: (user: SessionUser, target: Target) => boolean,
  mutate: (user: SessionUser, target: Target, check: TargetCheck) => Promise<MutationResult>,
  messages: { ok: string; unchanged: string },
): Promise<AdminActionState & { result?: MutationResult }> {
  const user = await getCurrentUser();
  const target = user ? await getTarget(handle) : null;
  if (!user || !target || !allowed(user, target)) return { error: REFUSED };

  let result: MutationResult;
  try {
    result = await mutate(user, target, (roles) => allowed(user, { id: target.id, roles }));
  } catch (err) {
    return actionFailed(action, err);
  }
  if (result === "ok") {
    refresh();
    return { ok: messages.ok, result };
  }
  if (result === "unchanged") return { error: messages.unchanged, result };
  return { error: FAILED[result], result };
}

const scopeLabel = (categoryId: string | null) => (categoryId ? " for one category" : "");

/** Grants superuser or moderator (global or one category) to a member. */
export async function grantRoleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = roleChangeSchema.safeParse({
    handle: field(formData, "handle"),
    role: field(formData, "role"),
    categoryId: field(formData, "categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { handle, role, categoryId } = parsed.data;

  const { result, ...state } = await act(
    "grant role",
    handle,
    (user, t) => mayGrant(user, t, role),
    (user, t, check) => grantRole({ actorId: user.id, targetId: t.id, role, categoryId }, check),
    {
      ok: `@${handle} is now a ${role}${scopeLabel(categoryId)}.`,
      unchanged: `@${handle} already has that role.`,
    },
  );
  // forum pages are cached with each author's role pill
  if (result === "ok") revalidateTag(FORUM_TAG, "max");
  return state;
}

/** Revokes one of a member's staff role grants. */
export async function revokeRoleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = roleChangeSchema.safeParse({
    handle: field(formData, "handle"),
    role: field(formData, "role"),
    categoryId: field(formData, "categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { handle, role, categoryId } = parsed.data;

  const { result, ...state } = await act(
    "revoke role",
    handle,
    (user, t) => mayRevoke(user, t, role),
    (user, t, check) => revokeRole({ actorId: user.id, targetId: t.id, role, categoryId }, check),
    {
      ok: `@${handle} is no longer a ${role}${scopeLabel(categoryId)}.`,
      unchanged: `@${handle} doesn't have that role.`,
    },
  );
  if (result === "ok") revalidateTag(FORUM_TAG, "max");
  return state;
}

/**
 * Bans a member (reason, optional length). Their next request already sees the ban; no cached page
 * shows ban state, so nothing is revalidated.
 */
export async function banAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = banSchema.safeParse({
    handle: field(formData, "handle"),
    reason: field(formData, "reason"),
    days: field(formData, "days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { handle, reason, days } = parsed.data;

  const { result: _, ...state } = await act(
    "ban",
    handle,
    (user, t) => mayBan(user, t),
    (user, t, check) => banUser({ actorId: user.id, targetId: t.id, reason, days }, check),
    { ok: `@${handle} is banned.`, unchanged: `@${handle} is already banned.` },
  );
  return state;
}

/** Lifts a member's active ban early. */
export async function liftBanAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = liftBanSchema.safeParse({ handle: field(formData, "handle") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { handle } = parsed.data;

  const { result: _, ...state } = await act(
    "lift ban",
    handle,
    (user, t) => mayBan(user, t),
    (user, t, check) => liftBan({ actorId: user.id, targetId: t.id }, check),
    { ok: `@${handle}'s ban is lifted.`, unchanged: `@${handle} isn't banned.` },
  );
  return state;
}
