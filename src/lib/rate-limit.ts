/**
 * Rate-limit rules (application.md 10.3), as pure functions. Each feature keeps its rules in its
 * own `limits.ts`; the action counts the user's recent rows in the database (rows created after
 * `windowStart(rule, now)`) and asks `isLimited()` before writing.
 *
 * ```ts
 * const now = new Date();
 * const count = await countRecentReplies(user.id, windowStart(REPLY_LIMIT, now));
 * if (isLimited(count, REPLY_LIMIT, user.createdAt, now, { exempt: isRateLimitExempt(user) }))
 *   return { error: "rate_limited" };
 * ```
 */
import type { RoleGrant } from "./authz";

export interface RateRule {
  /** Length of the sliding window */
  windowMs: number;
  /** Actions allowed per window for an account younger than FRESH_ACCOUNT_MS */
  fresh: number;
  /** Actions allowed per window for every other account */
  normal: number;
}

export interface LimitOptions {
  /** Skip the limit entirely; pass `isRateLimitExempt(user)` */
  exempt?: boolean;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const FRESH_ACCOUNT_MS = DAY_MS;

/**
 * True while the account is under 24 h old. A creation time in the future (clock skew) or an
 * invalid date counts as fresh, so mistakes fall on the strict side.
 */
export function isFreshAccount(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return !(age >= FRESH_ACCOUNT_MS);
}

/** How many actions this account may take per window */
export function limitFor(rule: RateRule, createdAt: Date, now: Date): number {
  return isFreshAccount(createdAt, now) ? rule.fresh : rule.normal;
}

/** Count rows created after this instant */
export function windowStart(rule: RateRule, now: Date): Date {
  return new Date(now.getTime() - rule.windowMs);
}

/**
 * Whether one more action would go over the limit. `count` is how many the user already took in
 * the current window (not including this one).
 */
export function isLimited(
  count: number,
  rule: RateRule,
  createdAt: Date,
  now: Date,
  { exempt = false }: LimitOptions = {},
): boolean {
  if (exempt) return false;
  return count >= limitFor(rule, createdAt, now);
}

/**
 * Staff are exempt from rate limits: anyone with a role grant (moderator for any scope, or above).
 * Members have no grants.
 */
export function isRateLimitExempt(user: { roles: readonly Pick<RoleGrant, "role">[] }): boolean {
  return user.roles.length > 0;
}
