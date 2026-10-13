import { describe, expect, it } from "vitest";
import { banSchema, liftBanSchema, membersQuerySchema, roleChangeSchema } from "./schemas";

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe("membersQuerySchema", () => {
  it("defaults to everyone, page 1", () => {
    expect(membersQuerySchema.parse({})).toEqual({ q: "", page: 1 });
  });

  it("trims and clips the search and reads the page", () => {
    expect(membersQuerySchema.parse({ q: "  nora  ", page: "3" })).toEqual({ q: "nora", page: 3 });
    expect(membersQuerySchema.parse({ q: "x".repeat(80) }).q).toHaveLength(60);
  });

  it("takes the first value of a repeated key", () => {
    expect(membersQuerySchema.parse({ q: ["a", "b"], page: ["2", "9"] })).toEqual({
      q: "a",
      page: 2,
    });
  });

  it("falls back on malformed values instead of failing the page", () => {
    for (const page of ["0", "-1", "1.5", "abc", "1000000"]) {
      expect(membersQuerySchema.parse({ page }).page, page).toBe(1);
    }
    expect(membersQuerySchema.parse({ q: 42 }).q).toBe("");
  });
});

describe("roleChangeSchema", () => {
  it("accepts superuser and global or per-category moderator", () => {
    expect(roleChangeSchema.parse({ handle: "nora", role: "superuser" })).toEqual({
      handle: "nora",
      role: "superuser",
      categoryId: null,
    });
    expect(roleChangeSchema.parse({ handle: "nora", role: "moderator", categoryId: "" })).toEqual({
      handle: "nora",
      role: "moderator",
      categoryId: null,
    });
    expect(
      roleChangeSchema.parse({ handle: " nora ", role: "moderator", categoryId: "12" }),
    ).toEqual({ handle: "nora", role: "moderator", categoryId: "12" });
  });

  it("never accepts the owner role or unknown roles", () => {
    expect(firstError(roleChangeSchema.safeParse({ handle: "nora", role: "admin" }))).toBe(
      "Pick a role.",
    );
    expect(firstError(roleChangeSchema.safeParse({ handle: "nora", role: "root" }))).toBe(
      "Pick a role.",
    );
  });

  it("limits only moderators to one category", () => {
    expect(
      firstError(
        roleChangeSchema.safeParse({ handle: "nora", role: "superuser", categoryId: "3" }),
      ),
    ).toBe("Only moderators can be limited to one category.");
  });

  it("rejects malformed category ids and handles", () => {
    for (const categoryId of ["0", "01", "-1", "1e3", "abc", "1".repeat(19)]) {
      expect(
        firstError(roleChangeSchema.safeParse({ handle: "nora", role: "moderator", categoryId })),
        categoryId,
      ).toBe("Pick a category.");
    }
    expect(roleChangeSchema.safeParse({ handle: "no", role: "moderator" }).success).toBe(false);
    expect(roleChangeSchema.safeParse({ handle: "a%b_c", role: "moderator" }).success).toBe(false);
  });
});

describe("banSchema", () => {
  it("reads a reason and a length in days, or permanent", () => {
    expect(banSchema.parse({ handle: "nora", reason: "  spam ", days: "7" })).toEqual({
      handle: "nora",
      reason: "spam",
      days: 7,
    });
    expect(banSchema.parse({ handle: "nora", reason: "spam", days: "" }).days).toBeNull();
  });

  it("requires a reason of at most 500 characters", () => {
    expect(firstError(banSchema.safeParse({ handle: "nora", reason: "  ", days: "" }))).toBe(
      "Give a reason.",
    );
    expect(firstError(banSchema.safeParse({ handle: "nora", days: "" }))).toBe("Give a reason.");
    expect(
      firstError(banSchema.safeParse({ handle: "nora", reason: "x".repeat(501), days: "" })),
    ).toBe("Keep the reason to 500 characters.");
  });

  it("only offers the listed lengths", () => {
    for (const days of ["2", "-7", "0", undefined]) {
      expect(firstError(banSchema.safeParse({ handle: "nora", reason: "spam", days }))).toBe(
        "Pick how long the ban lasts.",
      );
    }
  });
});

describe("liftBanSchema", () => {
  it("needs a valid handle", () => {
    expect(liftBanSchema.parse({ handle: "nora" })).toEqual({ handle: "nora" });
    expect(liftBanSchema.safeParse({ handle: "" }).success).toBe(false);
  });
});
