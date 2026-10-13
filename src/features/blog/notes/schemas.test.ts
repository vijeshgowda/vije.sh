import { describe, expect, it } from "vitest";
import manifest from "./git-slugs.json";
import {
  GIT_SLUG_MESSAGE,
  GIT_SLUGS,
  isGitSlug,
  NOTE_LIMITS,
  noteIdSchema,
  noteInputSchema,
  noteSlugSchema,
  suggestNoteSlug,
  tagsSchema,
} from "./schemas";
import { NOTES_TAG, noteTag, noteTags } from "./tags";

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe("note slugs", () => {
  it("accepts kebab-case, lowercasing and trimming what the editor sends", () => {
    expect(noteSlugSchema.parse("  Short-Note  ")).toBe("short-note");
    expect(noteSlugSchema.parse("a1-b2")).toBe("a1-b2");
  });

  it("rejects malformed and over-long slugs", () => {
    for (const bad of ["", "a--b", "-a", "a_b", "../x", "a b", "é"]) {
      expect(noteSlugSchema.safeParse(bad).success).toBe(false);
    }
    expect(noteSlugSchema.safeParse("a".repeat(NOTE_LIMITS.slug)).success).toBe(true);
    expect(noteSlugSchema.safeParse("a".repeat(NOTE_LIMITS.slug + 1)).success).toBe(false);
  });

  it("rejects every git post slug from the manifest", () => {
    expect(manifest.slugs.length).toBeGreaterThan(0);
    for (const slug of manifest.slugs) {
      expect(isGitSlug(slug)).toBe(true);
      expect(firstMessage(noteSlugSchema.safeParse(slug))).toBe(GIT_SLUG_MESSAGE);
    }
    expect(GIT_SLUGS.size).toBe(manifest.slugs.length);
    expect(isGitSlug("not-a-git-post")).toBe(false);
    expect(isGitSlug("x", new Set(["x"]))).toBe(true);
  });
});

describe("suggested slugs", () => {
  it("turns a title into a valid slug", () => {
    expect(suggestNoteSlug("Hello, World!")).toBe("hello-world");
    expect(suggestNoteSlug("  Café   déjà vu -- 2026 ")).toBe("cafe-deja-vu-2026");
    expect(suggestNoteSlug("!!!")).toBe("");
    const long = suggestNoteSlug(`${"a".repeat(99)} b c`);
    expect(long).toBe("a".repeat(99));
    expect(noteSlugSchema.safeParse(suggestNoteSlug("A title: with (punctuation)")).success).toBe(
      true,
    );
  });
});

describe("note ids", () => {
  it("accepts positive bigint strings only", () => {
    expect(noteIdSchema.safeParse("1").success).toBe(true);
    expect(noteIdSchema.safeParse("123456789012345678").success).toBe(true);
    for (const bad of ["0", "-1", "01", "1.5", "abc", "", "1234567890123456789"]) {
      expect(noteIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("tags", () => {
  it("splits a form field, trims and drops blanks and duplicates", () => {
    expect(tagsSchema.parse(" Notes, Engineering ,,Notes ")).toEqual(["Notes", "Engineering"]);
    expect(tagsSchema.parse(["a", " a ", "", "b"])).toEqual(["a", "b"]);
    expect(tagsSchema.parse("")).toEqual([]);
  });

  it("limits the count and length and refuses commas inside a tag", () => {
    const many = Array.from({ length: NOTE_LIMITS.tags + 1 }, (_, i) => `t${i}`);
    expect(tagsSchema.safeParse(many).success).toBe(false);
    expect(tagsSchema.safeParse(["x".repeat(NOTE_LIMITS.tag + 1)]).success).toBe(false);
    expect(tagsSchema.safeParse(["a,b"]).success).toBe(false);
  });
});

describe("note input", () => {
  const valid = { slug: "a-note", title: " A note ", bodyMd: "Hello\r\nworld\r" };

  it("applies defaults and normalises the body and summary", () => {
    expect(noteInputSchema.parse(valid)).toEqual({
      slug: "a-note",
      title: "A note",
      summary: null,
      bodyMd: "Hello\nworld\n",
      tags: [],
      visibility: "public",
    });
    expect(noteInputSchema.parse({ ...valid, summary: "  " }).summary).toBeNull();
    expect(noteInputSchema.parse({ ...valid, summary: " Short " }).summary).toBe("Short");
    expect(noteInputSchema.parse({ ...valid, tags: "a, b", visibility: "private" })).toMatchObject({
      tags: ["a", "b"],
      visibility: "private",
    });
  });

  it("enforces the database limits", () => {
    const bad = [
      { ...valid, title: "  " },
      { ...valid, title: "x".repeat(NOTE_LIMITS.title + 1) },
      { ...valid, summary: "x".repeat(NOTE_LIMITS.summary + 1) },
      { ...valid, bodyMd: "x".repeat(NOTE_LIMITS.body + 1) },
      { ...valid, visibility: "secret" },
      { ...valid, slug: manifest.slugs[0] },
      { title: "T", bodyMd: "" },
    ];
    for (const input of bad) expect(noteInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("cache tags", () => {
  it("always includes `notes` and each distinct slug once", () => {
    expect(noteTag("a")).toBe("note:a");
    expect(noteTags("a", "b", "a", null, undefined)).toEqual([NOTES_TAG, "note:a", "note:b"]);
    expect(noteTags()).toEqual(["notes"]);
  });
});
