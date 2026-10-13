"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import type { SessionUser } from "@/features/auth/queries";
import { can } from "@/lib/authz";
import { reportReason } from "./format";
import { reportLimitError, REPORT_LIMIT } from "./limits";
import { fileReport, resolveReports as resolveMutation } from "./mutations";
import { countRecentReports } from "./queries";
import { reportSchema, resolveSchema, type ReportTarget } from "./schemas";

/**
 * Reports (application.md 8.7): members report a thread, a reply or a profile; superusers and the
 * owner resolve them in /admin/reports. Standard order: parse -> current user -> can() -> rate
 * limit -> mutation. Filing a report changes no public page, so nothing is revalidated; resolving
 * refreshes the (uncached) queue.
 */

export type ReportResult =
  | { ok: true; message: string }
  /** `already`: this member has an open report on it (the island shows "Reported") */
  | { ok: false; error: string; already?: boolean };

export type ResolveResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/** Why this user can't report at all, or null for a member */
function cantReport(user: SessionUser | null): string | null {
  if (!user) return "Sign in to report.";
  if (!user.onboarded) return "Finish signing up before you report.";
  if (!can(user, "report.create")) return "Your account can't send reports.";
  return null;
}

const what = (t: ReportTarget) =>
  t.kind === "profile" ? "member" : t.kind === "thread" ? "thread" : "reply";

/** Files a report: `{ target, reason, details? }` (schemas.ts reportSchema). */
export async function reportContent(input: unknown): Promise<ReportResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const { target, reason, details } = parsed.data;

  const user = await getCurrentUser();
  const refused = cantReport(user);
  if (refused) return fail(refused);
  const reporter = user!;

  const recent = await countRecentReports(reporter.id, REPORT_LIMIT.windowMs);
  const limited = reportLimitError(reporter, recent, new Date());
  if (limited) return fail(limited);

  const outcome = await fileReport({
    reporterId: reporter.id,
    target,
    reason: reportReason(reason, details),
  });
  switch (outcome) {
    case "ok":
      return { ok: true, message: "Report sent. Thank you." };
    case "duplicate":
      return {
        ok: false,
        error: "You already reported this. Staff will review it.",
        already: true,
      };
    case "own":
      return fail(
        target.kind === "profile"
          ? "You can't report your own profile."
          : `You can't report your own ${what(target)}.`,
      );
    case "gone":
      return fail(`This ${what(target)} is no longer available.`);
  }
}

/** Marks one target's open reports actioned or dismissed: `{ ids, status }`. Superuser and up. */
export async function resolveReports(input: unknown): Promise<ResolveResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  const { ids, status } = parsed.data;

  const user = await getCurrentUser();
  if (!can(user, "report.review")) return fail("You can't review reports.");

  const n = await resolveMutation({ ids, status, actorId: user!.id });
  if (n === 0) return fail("These reports were already resolved.");
  refresh();
  const noun = n === 1 ? "Report" : `${n} reports`;
  return {
    ok: true,
    message: `${noun} ${status === "actioned" ? "marked actioned" : "dismissed"}`,
  };
}
