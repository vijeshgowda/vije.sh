import { describe, expect, it } from "vitest";
import {
  ACTION_LABEL,
  logHref,
  REPORT_REASONS,
  reportReason,
  resolveNote,
  targetHref,
} from "./format";

describe("reportReason()", () => {
  it("stores the reason's label, then any details", () => {
    expect(reportReason("spam", null)).toBe("Spam or advertising");
    expect(reportReason("other", "Impersonates me")).toBe("Something else: Impersonates me");
    expect(REPORT_REASONS.map((r) => r.value)).toEqual(["spam", "abuse", "unsafe", "other"]);
  });
});

describe("targetHref()", () => {
  it("links threads, replies (their frame) and profiles", () => {
    expect(targetHref({ kind: "thread", threadId: "42", categorySlug: "games" })).toBe(
      "/forum/games/42",
    );
    expect(
      targetHref({ kind: "reply", replyId: "7", threadId: "42", categorySlug: "local-ai" }),
    ).toBe("/forum/local-ai/42#reply-7");
    expect(targetHref({ kind: "profile", handle: "Ada_1" })).toBe("/u/Ada_1");
  });
});

describe("logHref()", () => {
  it("leaves page 1 without a query string", () => {
    expect(logHref()).toBe("/admin/log");
    expect(logHref(1)).toBe("/admin/log");
    expect(logHref(3)).toBe("/admin/log?page=3");
  });
});

describe("resolveNote()", () => {
  it("names the resolved reports", () => {
    expect(resolveNote("dismissed", ["12"])).toBe("dismissed: report #12");
    expect(resolveNote("actioned", ["12", "13"])).toBe("actioned: reports #12, #13");
  });

  it("stays within the log's 1,000-character note", () => {
    const ids = Array.from({ length: 50 }, (_, i) =>
      String(9_000_000_000_000_000_000n + BigInt(i)),
    );
    const note = resolveNote("actioned", ids);
    expect([...note]).toHaveLength(1000);
    expect(note.endsWith("\u2026")).toBe(true);
  });
});

it("labels every log action", () => {
  expect(ACTION_LABEL.report_resolve).toBe("Resolve report");
  expect(Object.values(ACTION_LABEL).every(Boolean)).toBe(true);
});
