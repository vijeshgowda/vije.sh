import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/features/auth/queries";

const refresh = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ refresh, revalidateTag }));
const getCurrentUser = vi.fn();
vi.mock("@/features/auth/session", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/features/forum/queries", () => ({ FORUM_TAG: "forum" }));
vi.mock("./queries", () => ({ getTarget: async () => ({ id: "t1", roles: [] }) }));
const m = { grantRole: vi.fn(), revokeRole: vi.fn(), banUser: vi.fn(), liftBan: vi.fn() };
vi.mock("./mutations", () => ({
  grantRole: (...a: unknown[]) => m.grantRole(...a),
  revokeRole: (...a: unknown[]) => m.revokeRole(...a),
  banUser: (...a: unknown[]) => m.banUser(...a),
  liftBan: (...a: unknown[]) => m.liftBan(...a),
}));

const { banAction, grantRoleAction, liftBanAction, revokeRoleAction } = await import("./actions");

const OWNER: SessionUser = {
  id: "u1",
  handle: "owner",
  displayName: null,
  onboarded: true,
  banned: false,
  roles: [{ role: "admin", categoryId: null }],
  createdAt: new Date(0),
};
const FAILED = { error: "Something went wrong and nothing was saved. Try again." };

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(OWNER);
});
afterEach(() => vi.restoreAllMocks());

describe("member actions", () => {
  it("still confirms a grant that worked", async () => {
    m.grantRole.mockResolvedValue("ok");
    expect(await grantRoleAction({}, form({ handle: "nora", role: "superuser" }))).toEqual({
      ok: "@nora is now a superuser.",
    });
    expect(refresh).toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("forum", "max");
  });

  // e.g. production before migration 0003: `invalid input value for enum app.role` (#52, #56)
  it.each([
    [
      "grant role",
      () => grantRoleAction({}, form({ handle: "nora", role: "superuser" })),
      "grantRole",
    ],
    [
      "revoke role",
      () => revokeRoleAction({}, form({ handle: "nora", role: "moderator" })),
      "revokeRole",
    ],
    ["ban", () => banAction({}, form({ handle: "nora", reason: "spam", days: "" })), "banUser"],
    ["lift ban", () => liftBanAction({}, form({ handle: "nora" })), "liftBan"],
  ] as const)(
    "%s returns a form error and logs the cause when the mutation throws",
    async (name, run, mutation) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error('invalid input value for enum app.role: "superuser"');
      m[mutation].mockRejectedValueOnce(err);
      expect(await run()).toEqual(FAILED);
      expect(log).toHaveBeenCalledWith(`admin: ${name} failed`, err);
      expect(refresh).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    },
  );
});
