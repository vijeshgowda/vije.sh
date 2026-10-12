import { describe, expect, it, vi } from "vitest";

const requirePage = vi.fn(async () => ({ id: "u1" }));
vi.mock("@/features/auth/guards", () => ({ requirePage }));

const { requireAdminSection } = await import("./guard");

describe("requireAdminSection()", () => {
  it("guards each page with its own path and action", async () => {
    await requireAdminSection("members");
    await requireAdminSection("categories");
    expect(requirePage.mock.calls).toEqual([
      ["/admin/members", "admin.view"],
      ["/admin/categories", "category.manage"],
    ]);
  });
});
