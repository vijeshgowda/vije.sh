import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS } from "@/lib/rate-limit";
import { limitError, REPLY_LIMIT, THREAD_LIMIT } from "./limits";

const now = new Date("2026-10-13T12:00:00Z");
const fresh = { createdAt: new Date(now.getTime() - HOUR_MS), roles: [] };
const old = { createdAt: new Date(now.getTime() - 2 * DAY_MS), roles: [] };
const staff = { ...fresh, roles: [{ role: "moderator" as const }] };

describe("forum limits (application.md 10.3)", () => {
  it("match the table", () => {
    expect(THREAD_LIMIT).toEqual({ windowMs: HOUR_MS, fresh: 1, normal: 5 });
    expect(REPLY_LIMIT).toEqual({ windowMs: HOUR_MS, fresh: 5, normal: 30 });
  });

  it("let new accounts start one thread an hour and older ones five", () => {
    expect(limitError("thread", fresh, 0, now)).toBeNull();
    expect(limitError("thread", fresh, 1, now)).toBe(
      "You can start 1 thread an hour while your account is new. Please try again later.",
    );
    expect(limitError("thread", old, 4, now)).toBeNull();
    expect(limitError("thread", old, 5, now)).toBe(
      "You can start 5 threads an hour. Please try again later.",
    );
  });

  it("let new accounts post five replies an hour and older ones thirty", () => {
    expect(limitError("reply", fresh, 4, now)).toBeNull();
    expect(limitError("reply", fresh, 5, now)).toBe(
      "You can post 5 replies an hour while your account is new. Please try again later.",
    );
    expect(limitError("reply", old, 29, now)).toBeNull();
    expect(limitError("reply", old, 30, now)).toBe(
      "You can post 30 replies an hour. Please try again later.",
    );
  });

  it("exempt staff", () => {
    expect(limitError("thread", staff, 100, now)).toBeNull();
    expect(limitError("reply", staff, 100, now)).toBeNull();
  });
});
