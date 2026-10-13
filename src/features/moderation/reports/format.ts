import type { Route } from "next";
import type { ModerationAction } from "@/db/types";
import { threadHref } from "@/features/forum/format";
import { profileHref } from "@/features/profile/format";
import { NOTE_MAX } from "../schemas";

/**
 * Client-safe report and moderation-log helpers: the reasons a member can pick, how a report's
 * stored text is built from them, and where each target lives.
 */

/** Same limit as the `app.reports.reason` check constraint (in code points) */
export const REASON_MAX = 1000;
/** Room for the details after the reason's label (`<label>: <details>`) */
export const DETAILS_MAX = 900;

export const REPORT_REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "abuse", label: "Harassment or abuse" },
  { value: "unsafe", label: "Illegal or harmful content" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [
  ReportReason,
  ...ReportReason[],
];

const LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<
  ReportReason,
  string
>;

/** The stored reason: "Spam or advertising", or "Spam or advertising: <details>" */
export const reportReason = (reason: ReportReason, details: string | null) =>
  details ? `${LABEL[reason]}: ${details}` : LABEL[reason];

/** What a report is about: a thread (frame 00), a reply, or a member's profile */
export type ReportKind = "thread" | "reply" | "profile";

/** A reported or logged post or member, as /admin shows it (never a user id) */
export type TargetRef =
  | { kind: "thread"; threadId: string; categorySlug: string }
  | { kind: "reply"; replyId: string; threadId: string; categorySlug: string }
  | { kind: "profile"; handle: string };

/** The public page of a target: the thread, the reply's frame in it, or the profile. */
export function targetHref(t: TargetRef): Route {
  if (t.kind === "profile") return profileHref(t.handle);
  const thread = threadHref(t.categorySlug, t.threadId);
  return t.kind === "thread" ? thread : (`${thread}#reply-${t.replyId}` as Route);
}

/** Moderation log entries per page */
export const LOG_PER_PAGE = 50;

/** /admin/log, page 1 without a query string */
export const logHref = (page = 1) => (page > 1 ? `/admin/log?page=${page}` : "/admin/log") as Route;

/** Open reports listed at most; older ones show once these are resolved */
export const OPEN_REPORTS_MAX = 200;
/** Resolved reports listed under the queue */
export const RESOLVED_REPORTS = 25;
/** Reports resolved by one click at most (one target's open reports) */
export const RESOLVE_MAX = 50;

/** How the log names each action */
export const ACTION_LABEL: Record<ModerationAction, string> = {
  hide: "Hide",
  unhide: "Unhide",
  lock: "Lock",
  unlock: "Unlock",
  pin: "Pin",
  unpin: "Unpin",
  move: "Move",
  ban: "Ban",
  unban: "Lift ban",
  role_grant: "Grant role",
  role_revoke: "Revoke role",
  report_resolve: "Resolve report",
  category_create: "Create category",
  category_update: "Edit category",
  category_delete: "Delete category",
};

export type Resolution = "actioned" | "dismissed";

/** The log note for resolved reports: "dismissed: report #12" or "actioned: reports #12, #13" */
export function resolveNote(status: Resolution, ids: readonly string[]): string {
  const list = ids.map((id) => `#${id}`).join(", ");
  const note = [...`${status}: ${ids.length === 1 ? "report" : "reports"} ${list}`];
  return note.length <= NOTE_MAX ? note.join("") : `${note.slice(0, NOTE_MAX - 1).join("")}\u2026`;
}
