import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  FRESH_ACCOUNT_MS,
  HOUR_MS,
  isFreshAccount,
  isLimited,
  isRateLimitExempt,
  limitFor,
  windowStart,
  type RateRule,
} from "./rate-limit";

const now = new Date("2026-10-12T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const reply: RateRule = { windowMs: HOUR_MS, fresh: 5, normal: 30 };

describe("isFreshAccount", () => {
  it("is fresh under 24 hours and normal from 24 hours on", () => {
    expect(FRESH_ACCOUNT_MS).toBe(DAY_MS);
    expect(isFreshAccount(now, now)).toBe(true);
    expect(isFreshAccount(ago(DAY_MS - 1), now)).toBe(true);
    expect(isFreshAccount(ago(DAY_MS), now)).toBe(false);
    expect(isFreshAccount(ago(30 * DAY_MS), now)).toBe(false);
  });

  it("treats a future or invalid creation time as fresh", () => {
    expect(isFreshAccount(new Date(now.getTime() + HOUR_MS), now)).toBe(true);
    expect(isFreshAccount(new Date(Number.NaN), now)).toBe(true);
  });
});

describe("limitFor", () => {
  it("picks the fresh or normal limit by account age", () => {
    expect(limitFor(reply, ago(HOUR_MS), now)).toBe(5);
    expect(limitFor(reply, ago(2 * DAY_MS), now)).toBe(30);
  });
});

describe("windowStart", () => {
  it("is the start of the window ending now", () => {
    expect(windowStart(reply, now)).toEqual(ago(HOUR_MS));
    expect(windowStart({ windowMs: DAY_MS, fresh: 5, normal: 20 }, now)).toEqual(ago(DAY_MS));
  });
});

describe("isLimited", () => {
  it("allows a fresh account up to its fresh limit", () => {
    const created = ago(HOUR_MS);
    expect(isLimited(0, reply, created, now)).toBe(false);
    expect(isLimited(4, reply, created, now)).toBe(false);
    expect(isLimited(5, reply, created, now)).toBe(true);
    expect(isLimited(6, reply, created, now)).toBe(true);
  });

  it("allows a normal account up to its normal limit", () => {
    const created = ago(DAY_MS);
    expect(isLimited(5, reply, created, now)).toBe(false);
    expect(isLimited(29, reply, created, now)).toBe(false);
    expect(isLimited(30, reply, created, now)).toBe(true);
  });

  it("blocks every action when the limit is zero", () => {
    const none: RateRule = { windowMs: DAY_MS, fresh: 0, normal: 20 };
    expect(isLimited(0, none, ago(HOUR_MS), now)).toBe(true);
    expect(isLimited(0, none, ago(2 * DAY_MS), now)).toBe(false);
  });

  it("never limits an exempt user", () => {
    expect(isLimited(1000, reply, ago(HOUR_MS), now, { exempt: true })).toBe(false);
    expect(isLimited(30, reply, ago(DAY_MS), now, { exempt: false })).toBe(true);
  });
});

describe("isRateLimitExempt", () => {
  it("exempts anyone with a role grant and no one else", () => {
    expect(isRateLimitExempt({ roles: [] })).toBe(false);
    expect(isRateLimitExempt({ roles: [{ role: "moderator" }] })).toBe(true);
    expect(isRateLimitExempt({ roles: [{ role: "superuser" }] })).toBe(true);
    expect(isRateLimitExempt({ roles: [{ role: "admin" }] })).toBe(true);
  });
});
