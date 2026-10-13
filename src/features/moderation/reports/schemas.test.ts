import { describe, expect, it } from "vitest";
import { logQuerySchema, reportSchema, resolveSchema } from "./schemas";

const first = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("reportSchema", () => {
  it("accepts a thread, a reply or a profile with a reason", () => {
    expect(reportSchema.parse({ target: { kind: "thread", id: "42" }, reason: "spam" })).toEqual({
      target: { kind: "thread", id: "42" },
      reason: "spam",
      details: null,
    });
    expect(
      reportSchema.parse({
        target: { kind: "profile", handle: "Ada_1" },
        reason: "other",
        details: " \0Impersonates\r\nme ",
      }),
    ).toEqual({
      target: { kind: "profile", handle: "Ada_1" },
      reason: "other",
      details: "Impersonates\nme",
    });
    expect(
      reportSchema.parse({ target: { kind: "reply", id: "7" }, reason: "abuse", details: "  " })
        .details,
    ).toBeNull();
  });

  it("rejects unknown targets and reasons", () => {
    const bad = (input: unknown) => first(reportSchema.safeParse(input));
    expect(bad({ target: { kind: "thread", id: "0" }, reason: "spam" })).toBe("Unknown post.");
    expect(bad({ target: { kind: "reply", id: 7 }, reason: "spam" })).toBe("Unknown post.");
    expect(bad({ target: { kind: "post", id: "7" }, reason: "spam" })).toBe("Unknown post.");
    expect(bad({ target: { kind: "profile", handle: "a" }, reason: "spam" })).toBe(
      "Unknown member.",
    );
    expect(bad({ target: { kind: "profile" }, reason: "spam" })).toBe("Unknown member.");
    expect(bad({ target: { kind: "thread", id: "1" } })).toBe("Pick a reason.");
    expect(bad({ target: { kind: "thread", id: "1" }, reason: "spam", details: 5 })).toBe(
      "Enter some text.",
    );
  });

  it("needs details for 'Something else' and caps them at 900 characters", () => {
    const bad = (details?: string, reason = "other") =>
      first(reportSchema.safeParse({ target: { kind: "thread", id: "1" }, reason, details }));
    expect(bad()).toBe("Tell us what's wrong.");
    expect(bad("   ")).toBe("Tell us what's wrong.");
    expect(bad("x".repeat(900))).toBeNull();
    expect(bad("x".repeat(901), "spam")).toBe("Keep the details to 900 characters.");
  });
});

describe("resolveSchema", () => {
  it("takes 1 to 50 report ids and actioned or dismissed", () => {
    expect(resolveSchema.parse({ ids: ["3", "3", "4"], status: "actioned" })).toEqual({
      ids: ["3", "4"],
      status: "actioned",
    });
    const bad = (input: unknown) => first(resolveSchema.safeParse(input));
    expect(bad({ ids: [], status: "dismissed" })).toBe("Unknown report.");
    expect(bad({ ids: "3", status: "dismissed" })).toBe("Unknown report.");
    expect(bad({ ids: ["-1"], status: "dismissed" })).toBe("Unknown report.");
    const many = Array.from({ length: 51 }, (_, i) => String(i + 1));
    expect(bad({ ids: many, status: "dismissed" })).toBe("Too many reports at once.");
    expect(bad({ ids: ["3"], status: "open" })).toBe("Unknown status.");
  });
});

describe("logQuerySchema", () => {
  it("reads ?page=, falling back to 1", () => {
    expect(logQuerySchema.parse({ page: "3" })).toEqual({ page: 3 });
    expect(logQuerySchema.parse({ page: ["2", "5"] })).toEqual({ page: 2 });
    expect(logQuerySchema.parse({})).toEqual({ page: 1 });
    expect(logQuerySchema.parse({ page: "0" })).toEqual({ page: 1 });
    expect(logQuerySchema.parse({ page: "x" })).toEqual({ page: 1 });
  });
});
