import { describe, expect, it } from "vitest";
import type { RoleGrant } from "@/lib/authz";
import { hasStaffGrant, mayMoveFrom } from "./staff";

const u = (...roles: RoleGrant[]) => ({ roles });
const mod = (categoryId: string | null): RoleGrant => ({ role: "moderator", categoryId });

describe("hasStaffGrant", () => {
  it("is true for any grant", () => {
    expect(hasStaffGrant(u())).toBe(false);
    expect(hasStaffGrant(u(mod("2")))).toBe(true);
  });
});

describe("mayMoveFrom", () => {
  it.each([
    ["a member", u(), false],
    ["a moderator of this category only", u(mod("2")), false],
    ["a moderator of another category only", u(mod("4")), false],
    ["a moderator of this and another category", u(mod("2"), mod("4")), true],
    ["a global moderator", u(mod(null)), true],
    ["a superuser", u({ role: "superuser", categoryId: null }), true],
    ["the owner", u({ role: "admin", categoryId: null }), true],
  ])("%s: %s", (_, user, expected) => {
    expect(mayMoveFrom(user, "2")).toBe(expected);
  });
});
