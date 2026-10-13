import { describe, expect, it } from "vitest";
import type { CurrentUser, Role, RoleGrant } from "@/lib/authz";
import {
  grantableRoles,
  grantProblem,
  lockedReason,
  mayBan,
  mayGrant,
  mayRevoke,
  memberHref,
  membersHref,
  type Target,
} from "./members";

const viewer = (id: string, ...roles: Role[]): CurrentUser => ({
  id,
  handle: id,
  onboarded: true,
  banned: false,
  roles: roles.map((role): RoleGrant => ({ role, categoryId: null })),
});

const owner = viewer("owner", "admin");
const su = viewer("su", "superuser");
const mod = viewer("mod", "moderator");
const member = viewer("member");
const bannedOwner = { ...owner, banned: true };

const target = (id: string, ...roles: Role[]): Target => ({ id, roles });
const T = {
  member: target("t-member"),
  moderator: target("t-mod", "moderator"),
  superuser: target("t-su", "superuser"),
  owner: target("owner", "admin"),
};

describe("links", () => {
  it("membersHref() keeps only a non-empty search and pages after the first", () => {
    expect(membersHref("")).toBe("/admin/members");
    expect(membersHref("", 1)).toBe("/admin/members");
    expect(membersHref("nora")).toBe("/admin/members?q=nora");
    expect(membersHref("a&b", 3)).toBe("/admin/members?q=a%26b&page=3");
    expect(membersHref("", 2)).toBe("/admin/members?page=2");
  });

  it("memberHref() encodes the handle", () => {
    expect(memberHref("Nora_1")).toBe("/admin/members/Nora_1");
  });
});

describe("grantProblem()", () => {
  it("refuses grants that change nothing", () => {
    expect(grantProblem(["superuser"], "moderator")).toMatch(/already moderate/);
    expect(grantProblem(["superuser"], "superuser")).toMatch(/already a superuser/);
    expect(grantProblem(["moderator"], "superuser")).toBeNull();
    expect(grantProblem([], "moderator")).toBeNull();
  });
});

// The role model (application.md 8.7): what each viewer may do to each kind of target.
describe("member controls by viewer and target", () => {
  const rows: [string, CurrentUser | null, Target, { grant: Role[]; ban: boolean }][] = [
    ["owner → member", owner, T.member, { grant: ["superuser", "moderator"], ban: true }],
    ["owner → moderator", owner, T.moderator, { grant: ["superuser", "moderator"], ban: true }],
    ["owner → superuser", owner, T.superuser, { grant: [], ban: true }],
    ["owner → self", owner, T.owner, { grant: [], ban: false }],
    ["superuser → member", su, T.member, { grant: ["moderator"], ban: true }],
    ["superuser → moderator", su, T.moderator, { grant: ["moderator"], ban: true }],
    ["superuser → superuser", su, T.superuser, { grant: [], ban: false }],
    ["superuser → owner", su, T.owner, { grant: [], ban: false }],
    ["superuser → self", su, target("su", "superuser"), { grant: [], ban: false }],
    ["moderator → member", mod, T.member, { grant: [], ban: false }],
    ["member → member", member, T.member, { grant: [], ban: false }],
    ["banned owner → member", bannedOwner, T.member, { grant: [], ban: false }],
    ["guest → member", null, T.member, { grant: [], ban: false }],
  ];

  it.each(rows)("%s", (_, user, t, want) => {
    expect(grantableRoles(user, t)).toEqual(want.grant);
    expect(mayBan(user, t)).toBe(want.ban);
  });

  it("revokes follow the same rule: superusers manage moderators, the owner also superusers", () => {
    expect(mayRevoke(owner, T.superuser, "superuser")).toBe(true);
    expect(mayRevoke(owner, T.moderator, "moderator")).toBe(true);
    expect(mayRevoke(su, T.moderator, "moderator")).toBe(true);
    expect(mayRevoke(su, T.superuser, "superuser")).toBe(false);
    expect(mayRevoke(su, T.superuser, "moderator")).toBe(false);
    expect(mayRevoke(owner, T.owner, "admin")).toBe(false);
    expect(mayRevoke(mod, T.moderator, "moderator")).toBe(false);
  });

  it("nobody grants the owner role", () => {
    expect(mayGrant(owner, T.member, "admin")).toBe(false);
    expect(mayGrant(su, T.member, "admin")).toBe(false);
  });
});

describe("lockedReason()", () => {
  it("explains why a member page has no controls", () => {
    expect(lockedReason(owner, T.owner)).toMatch(/This is you/);
    expect(lockedReason(su, target("su", "superuser"))).toMatch(/This is you/);
    expect(lockedReason(su, T.owner)).toMatch(/owner's account/);
    expect(lockedReason(su, T.superuser)).toMatch(/Only the owner/);
  });

  it("is null when the viewer may act", () => {
    expect(lockedReason(owner, T.superuser)).toBeNull();
    expect(lockedReason(su, T.moderator)).toBeNull();
    expect(lockedReason(su, T.member)).toBeNull();
  });
});
