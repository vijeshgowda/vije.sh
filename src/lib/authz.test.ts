import { describe, expect, it } from "vitest";
import { can, isMember, type Action, type CurrentUser, EDIT_WINDOW_MS } from "./authz";

const base: CurrentUser = { id: "u1", handle: "nora", onboarded: true, banned: false, roles: [] };
const users = {
  guest: null,
  unonboarded: { ...base, onboarded: false },
  member: base,
  banned: { ...base, banned: true },
  catMod: { ...base, roles: [{ role: "moderator" as const, categoryId: "2" }] },
  globalMod: { ...base, roles: [{ role: "moderator" as const, categoryId: null }] },
  admin: { ...base, roles: [{ role: "admin" as const, categoryId: null }] },
};
type Who = keyof typeof users;

// expected result for [guest, unonboarded, member, banned, catMod (in category 2), globalMod, admin]
const table: [Action, Parameters<typeof can>[2], boolean[]][] = [
  ["thread.create", { categoryId: "2" }, [false, false, true, false, true, true, true]],
  [
    "thread.create",
    { categoryId: "2", staffOnly: true },
    [false, false, false, false, true, true, true],
  ],
  [
    "thread.create",
    { categoryId: "3", staffOnly: true },
    [false, false, false, false, false, true, true],
  ],
  ["reply.create", { categoryId: "2" }, [false, false, true, false, true, true, true]],
  [
    "reply.create",
    { categoryId: "2", locked: true },
    [false, false, false, false, true, true, true],
  ],
  ["report.create", {}, [false, false, true, false, true, true, true]],
  ["post.hide", { categoryId: "2" }, [false, false, false, false, true, true, true]],
  ["post.hide", { categoryId: "3" }, [false, false, false, false, false, true, true]],
  ["thread.lock", { categoryId: "2" }, [false, false, false, false, true, true, true]],
  ["thread.pin", { categoryId: "2" }, [false, false, false, false, true, true, true]],
  ["thread.move", { categoryId: "2" }, [false, false, false, false, true, true, true]],
  ["report.review", { categoryId: "2" }, [false, false, false, false, true, true, true]],
  ["user.ban", {}, [false, false, false, false, false, true, true]],
  ["blog.write", {}, [false, false, false, false, false, false, true]],
  ["admin.manage", {}, [false, false, false, false, false, false, true]],
];

describe("can()", () => {
  const order: Who[] = ["guest", "unonboarded", "member", "banned", "catMod", "globalMod", "admin"];
  for (const [action, ctx, expected] of table) {
    for (const [i, who] of order.entries()) {
      it(`${who} ${expected[i] ? "can" : "cannot"} ${action} ${JSON.stringify(ctx)}`, () => {
        expect(can(users[who], action, ctx)).toBe(expected[i]);
      });
    }
  }

  describe("post.edit_own", () => {
    const createdAt = new Date("2026-10-09T10:00:00Z");
    const at = (ms: number) => new Date(createdAt.getTime() + ms);

    it("allows the author inside the edit window", () => {
      expect(
        can(base, "post.edit_own", { authorId: "u1", createdAt, now: at(EDIT_WINDOW_MS) }),
      ).toBe(true);
    });
    it("refuses after the window", () => {
      expect(
        can(base, "post.edit_own", { authorId: "u1", createdAt, now: at(EDIT_WINDOW_MS + 1) }),
      ).toBe(false);
    });
    it("refuses someone else's post, a deleted author or a missing date", () => {
      expect(can(base, "post.edit_own", { authorId: "u2", createdAt, now: at(0) })).toBe(false);
      expect(can(base, "post.edit_own", { authorId: null, createdAt, now: at(0) })).toBe(false);
      expect(can(base, "post.edit_own", { authorId: "u1" })).toBe(false);
    });
    it("uses the current time when none is given", () => {
      expect(can(base, "post.edit_own", { authorId: "u1", createdAt: new Date() })).toBe(true);
    });
    it("lets admins edit anything", () => {
      expect(can(users.admin, "post.edit_own", { authorId: "u2" })).toBe(true);
    });
  });

  it("defaults ctx to empty", () => {
    expect(can(base, "report.create")).toBe(true);
  });
});

describe("isMember()", () => {
  it("requires sign-in, onboarding and no ban", () => {
    expect(isMember(null)).toBe(false);
    expect(isMember(users.unonboarded)).toBe(false);
    expect(isMember(users.banned)).toBe(false);
    expect(isMember(base)).toBe(true);
  });
});
