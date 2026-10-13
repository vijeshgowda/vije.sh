import { describe, expect, it } from "vitest";
import {
  CATEGORY_LIMITS,
  categoryDetailsSchema,
  categoryIdSchema,
  categorySlugSchema,
  moveSchema,
  newCategorySchema,
  suggestCategorySlug,
} from "./schemas";

const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("category slugs", () => {
  it("accepts lowercase words joined by hyphens, trimmed and lowercased", () => {
    expect(categorySlugSchema.parse(" Local-AI ")).toBe("local-ai");
    expect(categorySlugSchema.parse("a1")).toBe("a1");
  });

  it("refuses empty, malformed, over-long and reserved slugs", () => {
    expect(issue(categorySlugSchema.safeParse(""))).toBe("is required");
    expect(issue(categorySlugSchema.safeParse("two  words"))).toBe(
      "must be lowercase words joined by hyphens",
    );
    expect(issue(categorySlugSchema.safeParse("-x"))).toBe(
      "must be lowercase words joined by hyphens",
    );
    expect(issue(categorySlugSchema.safeParse("a".repeat(CATEGORY_LIMITS.slug + 1)))).toBe(
      "must be at most 40 characters",
    );
    for (const s of ["new", "search", "latest", "all"]) {
      expect(issue(categorySlugSchema.safeParse(s))).toBe("is reserved for the forum");
    }
  });

  it("suggests a slug from a name", () => {
    expect(suggestCategorySlug("Local AI")).toBe("local-ai");
    expect(suggestCategorySlug("  Café & déjà vu ")).toBe("cafe-deja-vu");
    expect(suggestCategorySlug("!!!")).toBe("");
    expect(suggestCategorySlug(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });
});

describe("category details", () => {
  it("trims the name and turns an empty description into null", () => {
    expect(categoryDetailsSchema.parse({ name: " Games ", description: " " })).toEqual({
      name: "Games",
      description: null,
    });
    expect(categoryDetailsSchema.parse({ name: "Games" })).toEqual({
      name: "Games",
      description: null,
    });
    expect(categoryDetailsSchema.parse({ name: "Games", description: " Play " })).toEqual({
      name: "Games",
      description: "Play",
    });
  });

  it("enforces the table's limits", () => {
    expect(issue(categoryDetailsSchema.safeParse({ name: " " }))).toBe("is required");
    expect(issue(categoryDetailsSchema.safeParse({ name: "x".repeat(61) }))).toBe(
      "must be at most 60 characters",
    );
    expect(
      issue(categoryDetailsSchema.safeParse({ name: "x", description: "d".repeat(301) })),
    ).toBe("must be at most 300 characters");
  });

  it("defaults new categories to open posting", () => {
    expect(newCategorySchema.parse({ slug: "games", name: "Games" })).toEqual({
      slug: "games",
      name: "Games",
      description: null,
      staffOnly: false,
    });
  });
});

describe("ids and moves", () => {
  it("accepts positive bigint strings and up or down only", () => {
    expect(categoryIdSchema.safeParse("12").success).toBe(true);
    for (const bad of ["0", "-1", "1.5", "x", "", "1".repeat(19)]) {
      expect(categoryIdSchema.safeParse(bad).success).toBe(false);
    }
    expect(moveSchema.safeParse("up").success).toBe(true);
    expect(moveSchema.safeParse("sideways").success).toBe(false);
  });
});
