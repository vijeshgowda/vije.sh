import { describe, expect, it } from "vitest";
import type { Me } from "@/features/auth/components/UserMenu";
import { can } from "@/lib/authz";
import type { ThreadDetail } from "../types";
import { handleKey, meAsUser, postableCategories, postingBlock } from "./posting";
import { toolbarFrame, toolbarThread } from "./toolbar";

const me: Me = {
  handle: "Ada",
  displayName: null,
  onboarded: true,
  banned: false,
  roles: [],
  grants: [],
};

describe("posting rules for islands", () => {
  it("names why a visitor can't post", () => {
    expect(postingBlock(null)).toBe("guest");
    expect(postingBlock({ ...me, onboarded: false })).toBe("unonboarded");
    expect(postingBlock({ ...me, banned: true })).toBe("banned");
    expect(postingBlock(me)).toBeNull();
  });

  it("matches authors by handle in any letter case, never a deleted one", () => {
    expect(handleKey("Ada")).toBe("@ada");
    expect(handleKey(null)).toBeNull();
    const user = meAsUser(me);
    expect(user).toEqual({ id: "@ada", handle: "Ada", onboarded: true, banned: false, roles: [] });
    const createdAt = new Date();
    expect(can(user, "post.edit_own", { authorId: handleKey("ADA"), createdAt })).toBe(true);
    expect(can(user, "post.edit_own", { authorId: handleKey("bob"), createdAt })).toBe(false);
    expect(can(user, "post.edit_own", { authorId: handleKey(null), createdAt })).toBe(false);
    // an unfinished account has no handle and so no id to match
    expect(meAsUser({ ...me, handle: null, onboarded: false }).id).toBe("");
  });

  it("offers staff-only categories to their staff only", () => {
    const cats = [
      { id: "1", staffOnly: true },
      { id: "2", staffOnly: false },
      { id: "3", staffOnly: true },
    ];
    expect(postableCategories(cats, me).map((c) => c.id)).toEqual(["2"]);
    const catMod = { ...me, grants: [{ role: "moderator" as const, categoryId: "3" }] };
    expect(postableCategories(cats, catMod).map((c) => c.id)).toEqual(["2", "3"]);
    const su = { ...me, grants: [{ role: "superuser" as const, categoryId: null }] };
    expect(postableCategories(cats, su)).toHaveLength(3);
  });
});

describe("toolbar model", () => {
  const at = new Date("2026-10-13T12:00:00Z");
  const thread: ThreadDetail = {
    id: "42",
    title: "T",
    category: {
      id: "2",
      slug: "engineering",
      name: "Engineering",
      description: null,
      staffOnly: false,
    },
    createdAt: at,
    pinned: true,
    locked: false,
    frames: [],
  };

  it("keeps only plain JSON and the author's handle", () => {
    expect(
      toolbarFrame({
        key: "reply-9",
        kind: "reply",
        id: "9",
        no: 3,
        createdAt: at,
        editedAt: null,
        hidden: false,
        author: { handle: "ada", role: "member" },
        bodyMd: "secret source",
      }),
    ).toEqual({
      key: "reply-9",
      kind: "reply",
      id: "9",
      no: 3,
      hidden: false,
      authorHandle: "ada",
      createdAt: "2026-10-13T12:00:00.000Z",
    });
    expect(
      toolbarFrame({
        ...thread,
        key: "reply-8",
        kind: "reply",
        no: 2,
        editedAt: null,
        hidden: true,
        author: null,
        bodyMd: null,
      }).authorHandle,
    ).toBeNull();
    expect(toolbarThread(thread)).toEqual({
      id: "42",
      categoryId: "2",
      categorySlug: "engineering",
      locked: false,
      pinned: true,
    });
  });
});
