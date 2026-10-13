import {
  HOUR_MS,
  isFreshAccount,
  isLimited,
  isRateLimitExempt,
  limitFor,
  type RateRule,
} from "@/lib/rate-limit";
import type { RoleGrant } from "@/lib/authz";
import { plural } from "./format";

/** Forum rate limits (application.md 10.3). Staff (anyone with a role grant) are exempt. */
export const THREAD_LIMIT: RateRule = { windowMs: HOUR_MS, fresh: 1, normal: 5 };
export const REPLY_LIMIT: RateRule = { windowMs: HOUR_MS, fresh: 5, normal: 30 };

export type LimitedAction = "thread" | "reply";

export const LIMITS: Record<LimitedAction, RateRule> = {
  thread: THREAD_LIMIT,
  reply: REPLY_LIMIT,
};

const WORDS: Record<LimitedAction, [string, string, string]> = {
  thread: ["start", "thread", "threads"],
  reply: ["post", "reply", "replies"],
};

interface Poster {
  createdAt: Date;
  roles: readonly Pick<RoleGrant, "role">[];
}

/**
 * Null when the user may post once more, otherwise the message to show. `count` is how many they
 * already posted in the rule's window.
 */
export function limitError(
  action: LimitedAction,
  user: Poster,
  count: number,
  now: Date,
): string | null {
  const rule = LIMITS[action];
  if (!isLimited(count, rule, user.createdAt, now, { exempt: isRateLimitExempt(user) })) {
    return null;
  }
  const [verb, one, many] = WORDS[action];
  const n = plural(limitFor(rule, user.createdAt, now), one, many);
  const age = isFreshAccount(user.createdAt, now) ? " while your account is new" : "";
  return `You can ${verb} ${n} an hour${age}. Please try again later.`;
}
