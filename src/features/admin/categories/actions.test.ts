import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/authz";

const updateTag = vi.fn();
const refresh = vi.fn();
vi.mock("next/cache", () => ({ updateTag, refresh, cacheLife: vi.fn(), cacheTag: vi.fn() }));
const getCurrentUser = vi.fn();
vi.mock("@/features/auth/session", () => ({ getCurrentUser: () => getCurrentUser() }));
const m = {
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  moveCategory: vi.fn(),
  setCategoryStaffOnly: vi.fn(),
  deleteCategory: vi.fn(),
};
vi.mock("./mutations", async (orig) => ({
  ...(await orig<typeof import("./mutations")>()),
  createCategory: (...a: unknown[]) => m.createCategory(...a),
  updateCategory: (...a: unknown[]) => m.updateCategory(...a),
  moveCategory: (...a: unknown[]) => m.moveCategory(...a),
  setCategoryStaffOnly: (...a: unknown[]) => m.setCategoryStaffOnly(...a),
  deleteCategory: (...a: unknown[]) => m.deleteCategory(...a),
}));

const { CategorySlugTakenError } = await import("./mutations");
const {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  setStaffOnlyAction,
  updateCategoryAction,
} = await import("./actions");

const user = (roles: CurrentUser["roles"]): CurrentUser => ({
  id: "u1",
  handle: "someone",
  onboarded: true,
  banned: false,
  roles,
});
const OWNER = user([{ role: "admin", categoryId: null }]);
const SUPERUSER = user([{ role: "superuser", categoryId: null }]);
const DENIED = { error: "Only the site owner can manage categories." };
const MISSING = { error: "This category no longer exists." };

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const NEW = { slug: "games", name: "Games", description: "Play" };
const tagsUpdated = () => updateTag.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(OWNER);
});

describe("createCategoryAction", () => {
  it("creates a category as the owner and refreshes the forum", async () => {
    m.createCategory.mockResolvedValue({ id: "9", slug: "games" });
    expect(await createCategoryAction({}, form({ ...NEW, staffOnly: "on" }))).toEqual({
      message: "Created Games.",
    });
    expect(m.createCategory).toHaveBeenCalledWith("u1", {
      slug: "games",
      name: "Games",
      description: "Play",
      staffOnly: true,
    });
    expect(tagsUpdated()).toEqual(["forum", "category:games"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("reads an unticked box as open posting and missing fields as empty", async () => {
    m.createCategory.mockResolvedValue({ id: "9", slug: "games" });
    await createCategoryAction({}, form({ slug: "games", name: "Games" }));
    expect(m.createCategory).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ staffOnly: false }),
    );
    expect(await createCategoryAction({}, new FormData())).toEqual({
      field: "name",
      error: "Name is required.",
    });
  });

  it("returns the first invalid field before checking the user", async () => {
    expect(await createCategoryAction({}, form({ ...NEW, slug: "new" }))).toEqual({
      field: "slug",
      error: "Slug is reserved for the forum.",
    });
    expect(await createCategoryAction({}, form({ ...NEW, description: "d".repeat(301) }))).toEqual({
      field: "description",
      error: "Description must be at most 300 characters.",
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses anyone but the owner", async () => {
    for (const u of [null, SUPERUSER]) {
      getCurrentUser.mockResolvedValue(u);
      expect(await createCategoryAction({}, form(NEW))).toEqual(DENIED);
    }
    expect(m.createCategory).not.toHaveBeenCalled();
  });

  it("reports a taken slug and rethrows anything else", async () => {
    m.createCategory.mockRejectedValueOnce(new CategorySlugTakenError("games"));
    expect(await createCategoryAction({}, form(NEW))).toEqual({
      field: "slug",
      error: "Slug is already used by another category.",
    });
    m.createCategory.mockRejectedValueOnce(new Error("db down"));
    await expect(createCategoryAction({}, form(NEW))).rejects.toThrow("db down");
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("updateCategoryAction", () => {
  it("renames and refreshes the forum and the category", async () => {
    m.updateCategory.mockResolvedValue({ slug: "games", changed: true });
    expect(
      await updateCategoryAction({}, form({ id: "3", name: "Gaming", description: "" })),
    ).toEqual({ message: "Saved Gaming." });
    expect(m.updateCategory).toHaveBeenCalledWith("u1", "3", { name: "Gaming", description: null });
    expect(tagsUpdated()).toEqual(["forum", "category:games"]);
  });

  it("writes nothing visible when nothing changed", async () => {
    m.updateCategory.mockResolvedValue({ slug: "games", changed: false });
    expect(await updateCategoryAction({}, form({ id: "3", name: "Games" }))).toEqual({
      message: "Nothing changed.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rejects bad ids, bad input, other users and missing categories", async () => {
    expect(await updateCategoryAction({}, form({ id: "x", name: "A" }))).toEqual(MISSING);
    expect(await updateCategoryAction({}, form({ id: "3", name: "" }))).toEqual({
      field: "name",
      error: "Name is required.",
    });
    expect(await updateCategoryAction({}, form({ id: "3" }))).toMatchObject({ field: "name" });
    getCurrentUser.mockResolvedValueOnce(SUPERUSER);
    expect(await updateCategoryAction({}, form({ id: "3", name: "A" }))).toEqual(DENIED);
    m.updateCategory.mockResolvedValueOnce(null);
    expect(await updateCategoryAction({}, form({ id: "3", name: "A" }))).toEqual(MISSING);
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("moveCategoryAction", () => {
  it("moves a category and refreshes the forum", async () => {
    m.moveCategory.mockResolvedValue({ slug: "games", moved: true });
    expect(await moveCategoryAction({}, form({ id: "3", direction: "up" }))).toEqual({
      message: "Moved up.",
    });
    expect(m.moveCategory).toHaveBeenCalledWith("u1", "3", "up");
    expect(tagsUpdated()).toEqual(["forum", "category:games"]);
  });

  it("says when a category is already at an end", async () => {
    m.moveCategory.mockResolvedValue({ slug: "games", moved: false });
    expect(await moveCategoryAction({}, form({ id: "3", direction: "up" }))).toEqual({
      message: "Already at the top.",
    });
    expect(await moveCategoryAction({}, form({ id: "3", direction: "down" }))).toEqual({
      message: "Already at the bottom.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rejects bad input, other users and missing categories", async () => {
    expect(await moveCategoryAction({}, form({ id: "3", direction: "left" }))).toEqual(MISSING);
    expect(await moveCategoryAction({}, form({ direction: "up" }))).toEqual(MISSING);
    getCurrentUser.mockResolvedValueOnce(null);
    expect(await moveCategoryAction({}, form({ id: "3", direction: "up" }))).toEqual(DENIED);
    m.moveCategory.mockResolvedValueOnce(null);
    expect(await moveCategoryAction({}, form({ id: "3", direction: "up" }))).toEqual(MISSING);
  });
});

describe("setStaffOnlyAction", () => {
  it("sets and clears staff-only posting", async () => {
    m.setCategoryStaffOnly.mockResolvedValue({ slug: "games", changed: true });
    expect(await setStaffOnlyAction({}, form({ id: "3", staffOnly: "true" }))).toEqual({
      message: "Only staff start threads here now.",
    });
    expect(m.setCategoryStaffOnly).toHaveBeenCalledWith("u1", "3", true);
    expect(tagsUpdated()).toEqual(["forum", "category:games"]);
    updateTag.mockClear();
    m.setCategoryStaffOnly.mockResolvedValue({ slug: "games", changed: false });
    expect(await setStaffOnlyAction({}, form({ id: "3", staffOnly: "false" }))).toEqual({
      message: "Everyone can start threads.",
    });
    expect(m.setCategoryStaffOnly).toHaveBeenLastCalledWith("u1", "3", false);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rejects bad input, other users and missing categories", async () => {
    expect(await setStaffOnlyAction({}, form({ id: "3", staffOnly: "yes" }))).toEqual(MISSING);
    getCurrentUser.mockResolvedValueOnce(SUPERUSER);
    expect(await setStaffOnlyAction({}, form({ id: "3", staffOnly: "true" }))).toEqual(DENIED);
    m.setCategoryStaffOnly.mockResolvedValueOnce(null);
    expect(await setStaffOnlyAction({}, form({ id: "3", staffOnly: "true" }))).toEqual(MISSING);
  });
});

describe("deleteCategoryAction", () => {
  it("deletes an empty category and refreshes the forum", async () => {
    m.deleteCategory.mockResolvedValue({ status: "deleted", slug: "games" });
    expect(await deleteCategoryAction({}, form({ id: "3" }))).toEqual({
      message: "Category deleted.",
    });
    expect(m.deleteCategory).toHaveBeenCalledWith("u1", "3");
    expect(tagsUpdated()).toEqual(["forum", "category:games"]);
  });

  it("refuses a category with threads", async () => {
    m.deleteCategory.mockResolvedValue({ status: "not-empty", slug: "games" });
    expect(await deleteCategoryAction({}, form({ id: "3" }))).toEqual({
      error: "This category still has threads. Only empty categories can be deleted.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rejects bad ids, other users and missing categories", async () => {
    expect(await deleteCategoryAction({}, form({ id: "0" }))).toEqual(MISSING);
    getCurrentUser.mockResolvedValueOnce(SUPERUSER);
    expect(await deleteCategoryAction({}, form({ id: "3" }))).toEqual(DENIED);
    expect(m.deleteCategory).not.toHaveBeenCalled();
    m.deleteCategory.mockResolvedValueOnce(null);
    expect(await deleteCategoryAction({}, form({ id: "3" }))).toEqual(MISSING);
  });
});
