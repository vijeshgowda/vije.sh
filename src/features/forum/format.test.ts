import { describe, expect, it } from "vitest";
import {
  categoryHref,
  fmtDateTime,
  fmtDay,
  forumHref,
  frameLabel,
  isCategorySlug,
  parseThreadId,
  plural,
  threadAddress,
  threadHref,
} from "./format";

describe("parseThreadId", () => {
  it("accepts positive bigint ids as written in URLs", () => {
    expect(parseThreadId("1")).toBe("1");
    expect(parseThreadId("42")).toBe("42");
    expect(parseThreadId("9223372036854775807")).toBe("9223372036854775807");
  });

  it("rejects anything else", () => {
    for (const raw of [
      "",
      "0",
      "01",
      "-1",
      "+1",
      "1.0",
      "1e3",
      " 1",
      "abc",
      "42-title",
      "9223372036854775808",
      "99999999999999999999",
    ]) {
      expect(parseThreadId(raw), raw).toBeNull();
    }
  });
});

describe("isCategorySlug", () => {
  it("follows the categories.slug check constraint", () => {
    expect(isCategorySlug("local-ai")).toBe(true);
    expect(isCategorySlug("games")).toBe(true);
    expect(isCategorySlug("Games")).toBe(false);
    expect(isCategorySlug("-games")).toBe(false);
    expect(isCategorySlug("__none__")).toBe(false);
    expect(isCategorySlug("")).toBe(false);
  });
});

describe("hrefs", () => {
  it("builds forum, category and thread URLs", () => {
    expect(forumHref()).toBe("/forum");
    expect(categoryHref("local-ai")).toBe("/forum/local-ai");
    expect(threadHref("local-ai", "42")).toBe("/forum/local-ai/42");
  });
});

describe("labels", () => {
  it("writes thread ids as bus addresses", () => {
    expect(threadAddress("1")).toBe("0x01");
    expect(threadAddress("42")).toBe("0x2A");
    expect(threadAddress("4096")).toBe("0x1000");
    expect(threadAddress("9223372036854775807")).toBe("0x7FFFFFFFFFFFFFFF");
  });

  it("numbers frames with two digits", () => {
    expect(frameLabel(0)).toBe("FRAME 00");
    expect(frameLabel(7)).toBe("FRAME 07");
    expect(frameLabel(123)).toBe("FRAME 123");
  });

  it("formats dates in UTC", () => {
    const d = new Date("2026-01-05T23:07:00Z");
    expect(fmtDay(d)).toBe("5 Jan 2026");
    expect(fmtDateTime(d)).toBe("5 Jan 2026, 23:07 UTC");
    expect(fmtDateTime(new Date("2026-12-31T00:00:00Z"))).toBe("31 Dec 2026, 00:00 UTC");
  });

  it("pluralises", () => {
    expect(plural(1, "frame", "frames")).toBe("1 frame");
    expect(plural(0, "frame", "frames")).toBe("0 frames");
    expect(plural(2, "frame", "frames")).toBe("2 frames");
  });
});
