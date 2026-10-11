import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
const getCurrentUser = vi.fn();
vi.mock("@/features/auth/session", () => ({ getCurrentUser: () => getCurrentUser() }));

const { GET } = await import("./route");

describe("GET /api/me", () => {
  it("answers guests with null, never cached", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ user: null });
  });

  it("returns the handle and distinct role names only", async () => {
    getCurrentUser.mockResolvedValue({
      id: "secret-id",
      handle: "vije",
      displayName: "Vijesh",
      onboarded: true,
      banned: false,
      roles: [
        { role: "moderator", categoryId: "1" },
        { role: "moderator", categoryId: "2" },
        { role: "admin", categoryId: null },
      ],
    });
    expect(await (await GET()).json()).toEqual({
      user: {
        handle: "vije",
        displayName: "Vijesh",
        onboarded: true,
        roles: ["moderator", "admin"],
      },
    });
  });
});
