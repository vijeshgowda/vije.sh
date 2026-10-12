import { afterEach, describe, expect, it, vi } from "vitest";

// next/navigation's redirect() and notFound() throw; stand-ins that throw recognisable errors
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
const getCurrentUser = vi.fn();
vi.mock("./session", () => ({ getCurrentUser: () => getCurrentUser() }));

const { loginHref, requireCan, requirePage, requireUser } = await import("./guards");

const member = {
  id: "u1",
  handle: "nora",
  displayName: null,
  onboarded: true,
  banned: false,
  createdAt: new Date(),
  roles: [],
};
const superuser = { ...member, roles: [{ role: "superuser", categoryId: null }] };

afterEach(() => {
  getCurrentUser.mockReset();
});

describe("guards", () => {
  it("loginHref() encodes the way back", () => {
    expect(loginHref("/admin/members?q=a&b")).toBe("/login?next=%2Fadmin%2Fmembers%3Fq%3Da%26b");
  });

  it("requireUser() sends guests to sign-in and returns members", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireUser("/admin")).rejects.toThrow("redirect /login?next=%2Fadmin");
    getCurrentUser.mockResolvedValue(member);
    await expect(requireUser("/admin")).resolves.toBe(member);
  });

  it("requireCan() answers 404 unless can() allows it", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireCan("admin.view")).rejects.toThrow("not found");
    getCurrentUser.mockResolvedValue(member);
    await expect(requireCan("admin.view")).rejects.toThrow("not found");
    getCurrentUser.mockResolvedValue(superuser);
    await expect(requireCan("admin.view")).resolves.toBe(superuser);
    await expect(requireCan("category.manage")).rejects.toThrow("not found");
    await expect(
      requireCan("user.ban", { targetId: "u2", targetRoles: ["moderator"] }),
    ).resolves.toBe(superuser);
  });

  it("requirePage() asks guests to sign in and hides the page from everyone else", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requirePage("/admin/log", "admin.view")).rejects.toThrow(
      "redirect /login?next=%2Fadmin%2Flog",
    );
    getCurrentUser.mockResolvedValue(member);
    await expect(requirePage("/admin/log", "admin.view")).rejects.toThrow("not found");
    getCurrentUser.mockResolvedValue(superuser);
    await expect(requirePage("/admin/log", "admin.view")).resolves.toBe(superuser);
  });
});
