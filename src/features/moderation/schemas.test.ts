import { describe, expect, it } from "vitest";
import { hideSchema, moveSchema, noteSchema, NOTE_MAX, toggleSchema } from "./schemas";

describe("noteSchema", () => {
  it("trims, normalises line breaks and drops NUL", () => {
    expect(noteSchema.parse("  a\r\nb\0  ")).toBe("a\nb");
  });

  it("treats empty and missing as no note", () => {
    expect(noteSchema.parse("   ")).toBeNull();
    expect(noteSchema.parse(undefined)).toBeUndefined();
  });

  it("allows up to NOTE_MAX code points", () => {
    expect(noteSchema.safeParse("é".repeat(NOTE_MAX)).success).toBe(true);
    expect(noteSchema.safeParse("é".repeat(NOTE_MAX + 1)).success).toBe(false);
  });
});

describe("target schemas", () => {
  it("takes a thread or a reply by id", () => {
    expect(hideSchema.parse({ kind: "thread", id: "42" })).toEqual({ kind: "thread", id: "42" });
    expect(hideSchema.safeParse({ kind: "frame", id: "42" }).success).toBe(false);
    expect(hideSchema.safeParse({ kind: "reply", id: "-1" }).success).toBe(false);
    expect(hideSchema.safeParse({ kind: "reply", id: 7 }).success).toBe(false);
  });

  it("toggles need a boolean", () => {
    expect(toggleSchema.parse({ id: "1", on: false })).toEqual({ id: "1", on: false });
    expect(toggleSchema.safeParse({ id: "1", on: "true" }).success).toBe(false);
  });

  it("moves need a category slug", () => {
    expect(moveSchema.parse({ id: "1", category: "games" })).toEqual({
      id: "1",
      category: "games",
    });
    expect(moveSchema.safeParse({ id: "1", category: "../x" }).success).toBe(false);
    expect(moveSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});
