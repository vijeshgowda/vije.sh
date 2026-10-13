import {
  DAY_MS,
  isFreshAccount,
  isLimited,
  isRateLimitExempt,
  limitFor,
  type RateRule,
} from "@/lib/rate-limit";
import type { RoleGrant } from "@/lib/authz";
import { plural } from "@/features/forum/format";

/** Report rate limit (application.md 10.3). Staff (anyone with a role grant) are exempt. */
export const REPORT_LIMIT: RateRule = { windowMs: DAY_MS, fresh: 5, normal: 20 };

interface Reporter {
  createdAt: Date;
  roles: readonly Pick<RoleGrant, "role">[];
}

/**
 * Null when the user may report once more, otherwise the message to show. `count` is how many
 * reports they filed in the last day.
 */
export function reportLimitError(user: Reporter, count: number, now: Date): string | null {
  const exempt = isRateLimitExempt(user);
  if (!isLimited(count, REPORT_LIMIT, user.createdAt, now, { exempt })) return null;
  const n = plural(limitFor(REPORT_LIMIT, user.createdAt, now), "report", "reports");
  const age = isFreshAccount(user.createdAt, now) ? " while your account is new" : "";
  return `You can send ${n} a day${age}. Please try again later.`;
}
