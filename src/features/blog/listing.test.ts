import { describe, expect, it } from "vitest";
import { assertNoSlugClash, mergeNoteRows, NOTE_CATEGORY, postFromNote } from "./listing";
import type { PublishedNote, PublishedNoteSummary } from "./notes/queries";
import type { Post } from "./posts";

const post = (slug: string, date: string): Post => ({
  slug,
  title: slug.toUpperCase(),
  date,
  summary: `about ${slug}`,
  tags: ["Engineering"],
  visibility: "public",
  draft: false,
  body: "",
});

const note = (slug: string, date: string, over: Partial<PublishedNoteSummary> = {}) => ({
  id: "1",
  slug,
  title: slug.toUpperCase(),
  summary: null,
  tags: [],
  date,
  ...over,
});

describe("mergeNoteRows", () => {
  it("orders same-day git posts by publish number, then notes by slug", () => {
    const rows = mergeNoteRows(
      [
        { ...post("zebra", "2026-05-01"), seq: 2 },
        { ...post("apple", "2026-05-01"), seq: 1 },
      ],
      [note("mango", "2026-05-01")],
      new Set(["zebra", "apple"]),
    );
    expect(rows.map((r) => r.slug)).toEqual(["zebra", "apple", "mango"]);
    expect(rows[0]).not.toHaveProperty("seq");
  });

  it("numbers git posts and notes together, newest first, ties by slug", () => {
    const rows = mergeNoteRows(
      [post("old-post", "2026-01-01"), post("b-post", "2026-03-01")],
      [
        note("a-note", "2026-03-01", { summary: "S", tags: ["Ideas", "x"] }),
        note("new", "2026-04-01"),
      ],
      new Set(["old-post", "b-post"]),
    );
    expect(rows).toEqual([
      {
        id: "AN-004",
        slug: "new",
        title: "NEW",
        summary: "",
        category: NOTE_CATEGORY,
        date: "2026-04-01",
      },
      {
        id: "AN-003",
        slug: "a-note",
        title: "A-NOTE",
        summary: "S",
        category: "Ideas",
        date: "2026-03-01",
      },
      {
        id: "AN-002",
        slug: "b-post",
        title: "B-POST",
        summary: "about b-post",
        category: "Engineering",
        date: "2026-03-01",
      },
      {
        id: "AN-001",
        slug: "old-post",
        title: "OLD-POST",
        summary: "about old-post",
        category: "Engineering",
        date: "2026-01-01",
      },
    ]);
  });

  it("leaves out a note whose slug belongs to any git post, listed or not", () => {
    const rows = mergeNoteRows([], [note("draft-post", "2026-01-01")], new Set(["draft-post"]));
    expect(rows).toEqual([]);
  });
});

describe("postFromNote", () => {
  const published: PublishedNote = {
    ...note("n", "2026-10-01", { summary: "Short", tags: ["Ideas"] }),
    bodyMd: "# Hi",
    visibility: "unlisted",
    updated: "2026-10-01",
  };

  it("maps a note onto the Post shape", () => {
    expect(postFromNote(published)).toEqual({
      slug: "n",
      title: "N",
      date: "2026-10-01",
      summary: "Short",
      tags: ["Ideas"],
      visibility: "unlisted",
      draft: false,
      updated: undefined,
      body: "# Hi",
    });
  });

  it("shows a later edit date and falls back to a default category and empty summary", () => {
    const p = postFromNote({ ...published, summary: null, tags: [], updated: "2026-10-05" });
    expect(p).toMatchObject({ summary: "", tags: [NOTE_CATEGORY], updated: "2026-10-05" });
  });
});

describe("assertNoSlugClash", () => {
  it("passes when the slug spaces don't overlap", () => {
    expect(() => assertNoSlugClash(["a", "b"], ["c"])).not.toThrow();
  });

  it("names every clashing slug", () => {
    expect(() => assertNoSlugClash(["a"], ["a"])).toThrow(/share the slug "a":/);
    expect(() => assertNoSlugClash(new Set(["a", "b", "c"]), ["b", "a"])).toThrow(
      /share the slugs "a", "b"/,
    );
  });
});
