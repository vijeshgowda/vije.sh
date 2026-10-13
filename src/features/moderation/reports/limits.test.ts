import { describe, expect, it } from "vitest";
import { REPORT_LIMIT, reportLimitError } from "./limits";

const now = new Date("2026-10-13T12:00:00Z");
const old = { createdAt: new Date("2026-01-01T00:00:00Z"), roles: [] };
const fresh = { createdAt: new Date("2026-10-13T06:00:00Z"), roles: [] };

describe("reportLimitError()", () => {
  it("allows 20 a day, 5 for an account under a day old (application.md 10.3)", () => {
    expect(REPORT_LIMIT).toEqual({ windowMs: 86_400_000, fresh: 5, normal: 20 });
    expect(reportLimitError(old, 19, now)).toBeNull();
    expect(reportLimitError(old, 20, now)).toBe(
      "You can send 20 reports a day. Please try again later.",
    );
    expect(reportLimitError(fresh, 4, now)).toBeNull();
    expect(reportLimitError(fresh, 5, now)).toBe(
      "You can send 5 reports a day while your account is new. Please try again later.",
    );
  });

  it("exempts staff", () => {
    const mod = { ...fresh, roles: [{ role: "moderator" as const }] };
    expect(reportLimitError(mod, 500, now)).toBeNull();
  });
});
