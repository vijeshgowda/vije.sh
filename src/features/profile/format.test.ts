import { describe, expect, it } from "vitest";
import { parseHandle, postHref, profileHref, profileTag } from "./format";
import type { ProfilePost } from "./types";

const post = (over: Partial<ProfilePost> = {}): ProfilePost => ({
  kind: "thread",
  id: "42",
  threadId: "42",
  threadTitle: "Pooling with pg",
  category: { slug: "engineering", name: "Engineering" },
  createdAt: new Date("2026-10-05T12:00:00Z"),
  ...over,
});

describe("profile format", () => {
  it("builds the profile URL and cache tag", () => {
    expect(profileHref("Ada_99")).toBe("/u/Ada_99");
    expect(profileTag("0b7c-uuid")).toBe("profile:0b7c-uuid");
  });

  it("accepts only what the handle check constraint accepts", () => {
    expect(parseHandle("Ada_99")).toBe("Ada_99");
    for (const bad of ["ab", "a".repeat(25), "ada lovelace", "ada%20", "ad.a", "", "0"]) {
      expect(parseHandle(bad)).toBeNull();
    }
  });

  it("links a thread to its page and a reply to its frame", () => {
    expect(postHref(post())).toBe("/forum/engineering/42");
    expect(postHref(post({ kind: "reply", id: "7" }))).toBe("/forum/engineering/42#reply-7");
  });
});
