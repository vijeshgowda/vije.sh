import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  editSchema,
  fieldOf,
  newThreadSchema,
  normaliseBody,
  normaliseTitle,
  postRefSchema,
  replySchema,
  TITLE_MAX,
} from "./schemas";

const firstIssue = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("normalising", () => {
  it("turns CRLF into LF, drops NUL and trims the body", () => {
    expect(normaliseBody("\r\n  a\r\nb\rc\0  \n")).toBe("a\nb\nc");
  });

  it("makes the title one line", () => {
    expect(normaliseTitle("  Hello \n\t world\0 ")).toBe("Hello world");
  });
});

describe("newThreadSchema", () => {
  const ok = { category: "games", title: " Pooling  with pg ", body: "Use **one**.\r\n" };

  it("accepts and normalises a thread", () => {
    expect(newThreadSchema.parse(ok)).toEqual({
      category: "games",
      title: "Pooling with pg",
      body: "Use **one**.",
    });
  });

  it("checks the category slug", () => {
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, category: "Bad Slug" }))).toBe(
      "Pick a category.",
    );
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, category: null }))).toBe(
      "Pick a category.",
    );
  });

  it("limits the title in characters, not UTF-16 units", () => {
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, title: " ab " }))).toBe(
      "Use at least 3 characters for the title.",
    );
    // two emoji are 4 UTF-16 units but 2 characters, like Postgres counts them
    expect(newThreadSchema.safeParse({ ...ok, title: "😀😀" }).success).toBe(false);
    expect(newThreadSchema.safeParse({ ...ok, title: "😀".repeat(TITLE_MAX) }).success).toBe(true);
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, title: "x".repeat(TITLE_MAX + 1) }))).toBe(
      `Keep the title to ${TITLE_MAX} characters.`,
    );
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, title: undefined }))).toBe(
      "Enter some text.",
    );
  });

  it("needs a body within the limit", () => {
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, body: " \r\n " }))).toBe(
      "Write a message.",
    );
    expect(newThreadSchema.safeParse({ ...ok, body: "x".repeat(BODY_MAX) }).success).toBe(true);
    expect(firstIssue(newThreadSchema.safeParse({ ...ok, body: "x".repeat(BODY_MAX + 1) }))).toBe(
      `Keep the message to ${BODY_MAX} characters.`,
    );
  });
});

describe("replySchema", () => {
  it("needs a valid thread id", () => {
    expect(replySchema.parse({ threadId: "42", body: "Hi" })).toEqual({
      threadId: "42",
      body: "Hi",
    });
    for (const threadId of ["0", "-1", "042", "x", null]) {
      expect(firstIssue(replySchema.safeParse({ threadId, body: "Hi" }))).toBe("Unknown thread.");
    }
  });
});

describe("editSchema and postRefSchema", () => {
  it("needs a title for a thread but not for a reply", () => {
    expect(editSchema.parse({ kind: "thread", id: "7", title: "A title", body: "B" })).toEqual({
      kind: "thread",
      id: "7",
      title: "A title",
      body: "B",
    });
    expect(editSchema.parse({ kind: "reply", id: "7", title: "ignored", body: "B" })).toEqual({
      kind: "reply",
      id: "7",
      body: "B",
    });
    expect(editSchema.safeParse({ kind: "thread", id: "7", body: "B" }).success).toBe(false);
  });

  it("rejects unknown kinds and ids", () => {
    expect(firstIssue(editSchema.safeParse({ kind: "post", id: "7", body: "B" }))).toBe(
      "Unknown post.",
    );
    expect(firstIssue(editSchema.safeParse({ kind: "reply", id: "x", body: "B" }))).toBe(
      "Unknown post.",
    );
    expect(postRefSchema.safeParse({ kind: "reply", id: "9" }).success).toBe(true);
    expect(postRefSchema.safeParse({ kind: "nope", id: "9" }).success).toBe(false);
  });
});

describe("fieldOf", () => {
  it("names form fields and nothing else", () => {
    expect(fieldOf(["title"])).toBe("title");
    expect(fieldOf(["body", 0])).toBe("body");
    expect(fieldOf(["category"])).toBe("category");
    expect(fieldOf(["threadId"])).toBeUndefined();
    expect(fieldOf([])).toBeUndefined();
  });
});
