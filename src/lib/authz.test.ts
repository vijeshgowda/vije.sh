import { describe, expect, it } from "vitest";
import {
  can,
  EDIT_WINDOW_MS,
  highestRole,
  isGlobalModerator,
  isMember,
  isOwner,
  isSuperuser,
  moderates,
  ROLE_LABEL,
  type Action,
  type Ctx,
  type CurrentUser,
  type Role,
} from "./authz";

const base: CurrentUser = { id: "u1", handle: "nora", onboarded: true, banned: false, roles: [] };
const users = {
  guest: null,
  unonboarded: { ...base, onboarded: false },
  member: base,
  banned: { ...base, banned: true },
  catMod: { ...base, roles: [{ role: "moderator" as const, categoryId: "2" }] },
  globalMod: { ...base, roles: [{ role: "moderator" as const, categoryId: null }] },
  superuser: { ...base, roles: [{ role: "superuser" as const, categoryId: null }] },
  owner: { ...base, roles: [{ role: "admin" as const, categoryId: null }] },
  bannedOwner: { ...base, banned: true, roles: [{ role: "admin" as const, categoryId: null }] },
};
type Who = keyof typeof users;
const order: Who[] = [
  "guest",
  "unonboarded",
  "member",
  "banned",
  "catMod",
  "globalMod",
  "superuser",
  "owner",
  "bannedOwner",
];

// someone else (u2) holding these roles
const target = (...targetRoles: Role[]): Ctx => ({
  targetId: "u2",
  targetRoles,
});

// expected result per user, in `order`:
// guest, unonboarded, member, banned, catMod (of category 2), globalMod, superuser, owner, bannedOwner
const N = false;
const Y = true;
const table: [Action, Ctx, boolean[]][] = [
  ["thread.create", { categoryId: "2" }, [N, N, Y, N, Y, Y, Y, Y, N]],
  ["thread.create", { categoryId: "2", staffOnly: true }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["thread.create", { categoryId: "3", staffOnly: true }, [N, N, N, N, N, Y, Y, Y, N]],
  ["reply.create", { categoryId: "2" }, [N, N, Y, N, Y, Y, Y, Y, N]],
  ["reply.create", { categoryId: "2", locked: true }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["report.create", {}, [N, N, Y, N, Y, Y, Y, Y, N]],
  ["post.hide", { categoryId: "2" }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["post.hide", { categoryId: "3" }, [N, N, N, N, N, Y, Y, Y, N]],
  ["thread.lock", { categoryId: "2" }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["thread.pin", { categoryId: "2" }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["thread.move", { categoryId: "2" }, [N, N, N, N, Y, Y, Y, Y, N]],
  ["thread.move", { categoryId: "3" }, [N, N, N, N, N, Y, Y, Y, N]],
  ["admin.view", {}, [N, N, N, N, N, N, Y, Y, N]],
  ["report.review", {}, [N, N, N, N, N, N, Y, Y, N]],
  ["report.review", { categoryId: "2" }, [N, N, N, N, N, N, Y, Y, N]],
  ["blog.write", {}, [N, N, N, N, N, N, N, Y, N]],
  ["category.manage", {}, [N, N, N, N, N, N, N, Y, N]],
  // bans: superuser and up, on members and moderators; only the owner bans superusers
  ["user.ban", target(), [N, N, N, N, N, N, Y, Y, N]],
  ["user.ban", target("moderator"), [N, N, N, N, N, N, Y, Y, N]],
  ["user.ban", target("superuser"), [N, N, N, N, N, N, N, Y, N]],
  ["user.ban", target("superuser", "moderator"), [N, N, N, N, N, N, N, Y, N]],
  ["user.ban", target("admin"), [N, N, N, N, N, N, N, N, N]],
  ["user.ban", { targetId: "u1", targetRoles: [] }, [N, N, N, N, N, N, N, N, N]],
  ["user.ban", { targetId: "u2" }, [N, N, N, N, N, N, N, N, N]],
  ["user.ban", { targetRoles: [] }, [N, N, N, N, N, N, N, N, N]],
  // grants: superusers manage moderators, the owner also superusers, nobody the owner
  ["role.grant", { ...target(), grantRole: "moderator" }, [N, N, N, N, N, N, Y, Y, N]],
  ["role.grant", { ...target("moderator"), grantRole: "moderator" }, [N, N, N, N, N, N, Y, Y, N]],
  ["role.grant", { ...target("superuser"), grantRole: "moderator" }, [N, N, N, N, N, N, N, Y, N]],
  ["role.grant", { ...target(), grantRole: "superuser" }, [N, N, N, N, N, N, N, Y, N]],
  ["role.grant", { ...target("superuser"), grantRole: "superuser" }, [N, N, N, N, N, N, N, Y, N]],
  ["role.grant", { ...target(), grantRole: "admin" }, [N, N, N, N, N, N, N, N, N]],
  ["role.grant", { ...target("admin"), grantRole: "moderator" }, [N, N, N, N, N, N, N, N, N]],
  [
    "role.grant",
    { targetId: "u1", targetRoles: [], grantRole: "moderator" },
    [N, N, N, N, N, N, N, N, N],
  ],
  ["role.grant", target(), [N, N, N, N, N, N, N, N, N]],
];

describe("can()", () => {
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
    it("lets the owner edit anything, but not superusers or moderators", () => {
      expect(can(users.owner, "post.edit_own", { authorId: "u2" })).toBe(true);
      expect(can(users.superuser, "post.edit_own", { authorId: "u2", createdAt })).toBe(false);
      expect(can(users.globalMod, "post.edit_own", { authorId: "u2", createdAt })).toBe(false);
    });
  });

  it("defaults ctx to empty", () => {
    expect(can(base, "report.create")).toBe(true);
  });
});

describe("role helpers", () => {
  it("rank owner above superuser above moderator", () => {
    expect(isOwner(users.owner)).toBe(true);
    expect(isOwner(users.superuser)).toBe(false);
    expect(isSuperuser(users.owner)).toBe(true);
    expect(isSuperuser(users.superuser)).toBe(true);
    expect(isSuperuser(users.globalMod)).toBe(false);
    expect(isGlobalModerator(users.globalMod)).toBe(true);
    expect(isGlobalModerator(users.catMod)).toBe(false);
    expect(isGlobalModerator(users.superuser)).toBe(false);
  });

  it("moderates() covers scoped and global moderators, superusers and the owner", () => {
    expect(moderates(users.catMod, "2")).toBe(true);
    expect(moderates(users.catMod, "3")).toBe(false);
    expect(moderates(users.catMod)).toBe(false);
    expect(moderates(users.globalMod)).toBe(true);
    expect(moderates(users.superuser, "3")).toBe(true);
    expect(moderates(users.owner)).toBe(true);
    expect(moderates(base, "2")).toBe(false);
  });

  it("work on the grants /api/me returns", () => {
    expect(isSuperuser({ roles: [{ role: "superuser", categoryId: null }] })).toBe(true);
    expect(isSuperuser({ roles: [] })).toBe(false);
  });

  it("label the stored admin role as Owner", () => {
    expect(ROLE_LABEL).toEqual({ admin: "Owner", superuser: "Superuser", moderator: "Moderator" });
  });

  it("highestRole() picks the top role from names or grants", () => {
    expect(highestRole([])).toBeNull();
    expect(highestRole(["moderator", "superuser"])).toBe("superuser");
    expect(highestRole(users.owner.roles)).toBe("admin");
    expect(highestRole(users.catMod.roles)).toBe("moderator");
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
