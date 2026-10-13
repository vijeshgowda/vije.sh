import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/features/auth/queries";
import type { ModerationTarget } from "./queries";

const updateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ updateTag }));
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/session", () => ({ getCurrentUser }));
vi.mock("@/features/forum/queries", () => ({
  FORUM_TAG: "forum",
  categoryTag: (slug: string) => `category:${slug}`,
  threadTag: (id: string) => `thread:${id}`,
}));
const q = vi.hoisted(() => ({
  targetForModeration: vi.fn(),
  hiddenSource: vi.fn(),
  hiddenThread: vi.fn(),
  listCategoryOptions: vi.fn(),
  categoryBySlug: vi.fn(),
}));
vi.mock("./queries", () => q);
const m = vi.hoisted(() => ({
  setHidden: vi.fn(),
  setLocked: vi.fn(),
  setPinned: vi.fn(),
  moveThread: vi.fn(),
}));
vi.mock("./mutations", () => m);

const a = await import("./actions");

const member: SessionUser = {
  id: "u-member",
  handle: "ada",
  displayName: null,
  onboarded: true,
  banned: false,
  createdAt: new Date("2026-01-01"),
  roles: [],
};
const as = (over: Partial<SessionUser>): SessionUser => ({ ...member, ...over });
const moderatorOf = (...categoryIds: (string | null)[]) =>
  as({ id: "u-mod", roles: categoryIds.map((categoryId) => ({ role: "moderator", categoryId })) });
const superuser = as({ id: "u-super", roles: [{ role: "superuser", categoryId: null }] });

// engineering = 2, games = 4, general = 3
const thread: ModerationTarget = {
  kind: "thread",
  id: "42",
  threadId: "42",
  categoryId: "2",
  categorySlug: "engineering",
  hidden: false,
  locked: false,
  pinned: false,
};
const reply: ModerationTarget = { ...thread, kind: "reply", id: "7" };
const categories = [
  { id: "1", slug: "announcements", name: "Announcements" },
  { id: "2", slug: "engineering", name: "Engineering" },
  { id: "3", slug: "general", name: "General" },
  { id: "4", slug: "games", name: "Games" },
];

const NOT_ALLOWED = { ok: false, error: "You can't moderate this post." };
const tags = () => updateTag.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(moderatorOf("2"));
  q.targetForModeration.mockImplementation(async (kind: string) =>
    kind === "thread" ? thread : reply,
  );
  q.listCategoryOptions.mockResolvedValue(categories);
  q.categoryBySlug.mockImplementation(
    async (slug: string) => categories.find((c) => c.slug === slug) ?? null,
  );
  m.setHidden.mockResolvedValue("ok");
  m.setLocked.mockResolvedValue("ok");
  m.setPinned.mockResolvedValue("ok");
  m.moveThread.mockResolvedValue("ok");
});

describe("who may moderate", () => {
  it.each([
    ["a guest", null],
    ["a member", member],
    [
      "an unonboarded moderator",
      as({ onboarded: false, roles: [{ role: "moderator", categoryId: null }] }),
    ],
    ["a banned moderator", as({ banned: true, roles: [{ role: "moderator", categoryId: null }] })],
  ])("refuses %s before looking anything up", async (_, user) => {
    getCurrentUser.mockResolvedValue(user);
    expect(await a.hidePost({ kind: "reply", id: "7" })).toEqual(NOT_ALLOWED);
    expect(q.targetForModeration).not.toHaveBeenCalled();
    expect(m.setHidden).not.toHaveBeenCalled();
  });

  it("refuses a moderator of another category", async () => {
    getCurrentUser.mockResolvedValue(moderatorOf("4"));
    expect(await a.hidePost({ kind: "reply", id: "7" })).toEqual(NOT_ALLOWED);
    expect(await a.lockThread({ id: "42", on: true })).toEqual(NOT_ALLOWED);
    expect(await a.pinThread({ id: "42", on: true })).toEqual(NOT_ALLOWED);
    expect(await a.revealPost({ kind: "reply", id: "7" })).toEqual(NOT_ALLOWED);
    expect(await a.moveTargets({ id: "42" })).toEqual(NOT_ALLOWED);
    expect(m.setHidden).not.toHaveBeenCalled();
    expect(m.setLocked).not.toHaveBeenCalled();
    expect(m.setPinned).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["a global moderator", moderatorOf(null)],
    ["a superuser", superuser],
    ["the owner", as({ id: "u-owner", roles: [{ role: "admin", categoryId: null }] })],
  ])("lets %s moderate any category", async (_, user) => {
    getCurrentUser.mockResolvedValue(user);
    expect(await a.hidePost({ kind: "reply", id: "7" })).toMatchObject({ ok: true });
  });

  it("says when the post is gone", async () => {
    q.targetForModeration.mockResolvedValue(null);
    expect(await a.hidePost({ kind: "reply", id: "7" })).toEqual({
      ok: false,
      error: "This post is no longer available.",
    });
  });
});

describe("hidePost / unhidePost", () => {
  it("hides a reply with a reason and refreshes its thread and category", async () => {
    const r = await a.hidePost({ kind: "reply", id: "7", note: "  Spam link.  " });
    expect(r).toEqual({ ok: true, message: "Reply hidden" });
    expect(m.setHidden).toHaveBeenCalledWith({
      kind: "reply",
      id: "7",
      categoryId: "2",
      actorId: "u-mod",
      hidden: true,
      note: "Spam link.",
    });
    expect(tags()).toEqual(["category:engineering", "thread:42"]);
  });

  it("hides a thread and refreshes everything that lists it", async () => {
    expect(await a.hidePost({ kind: "thread", id: "42" })).toEqual({
      ok: true,
      message: "Thread hidden",
    });
    expect(m.setHidden).toHaveBeenCalledWith(expect.objectContaining({ note: undefined }));
    expect(tags()).toEqual(["forum", "category:engineering", "thread:42"]);
  });

  it("unhides a reply and a thread", async () => {
    expect(await a.unhidePost({ kind: "reply", id: "7" })).toEqual({
      ok: true,
      message: "Reply visible again",
    });
    expect(m.setHidden).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "reply", hidden: false }),
    );
    expect(await a.unhidePost({ kind: "thread", id: "42" })).toEqual({
      ok: true,
      message: "Thread visible again",
    });
  });

  it("treats an already hidden post as done", async () => {
    m.setHidden.mockResolvedValue("unchanged");
    expect(await a.hidePost({ kind: "reply", id: "7" })).toMatchObject({ ok: true });
    expect(tags()).toContain("thread:42");
  });

  it("refuses when the post moved since the check", async () => {
    m.setHidden.mockResolvedValue("stale");
    expect(await a.unhidePost({ kind: "reply", id: "7" })).toEqual({
      ok: false,
      error: "This post changed since the page loaded. Reload and try again.",
    });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "post", id: "7" }, "Unknown post."],
    [{ kind: "reply", id: "07" }, "Unknown post."],
    [{ kind: "reply", id: "7", note: "x".repeat(1001) }, "Keep the reason to 1000 characters."],
    [null, expect.any(String)],
  ])("rejects bad input %j", async (input, error) => {
    expect(await a.hidePost(input)).toEqual({ ok: false, error });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects bad unhide input", async () => {
    expect(await a.unhidePost({ kind: "reply" })).toEqual({ ok: false, error: "Unknown post." });
  });
});

describe("revealPost", () => {
  it("returns the stored text of a hidden post to staff in scope", async () => {
    q.hiddenSource.mockResolvedValue({ title: null, body: "<b>raw</b>", authorHandle: "ada" });
    expect(await a.revealPost({ kind: "reply", id: "7" })).toEqual({
      ok: true,
      title: null,
      body: "<b>raw</b>",
      authorHandle: "ada",
    });
    expect(q.hiddenSource).toHaveBeenCalledWith("reply", "7");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("says when the post isn't hidden", async () => {
    q.hiddenSource.mockResolvedValue(null);
    expect(await a.revealPost({ kind: "reply", id: "7" })).toEqual({
      ok: false,
      error: "This post isn't hidden any more.",
    });
  });

  it("rejects bad input", async () => {
    expect(await a.revealPost({ kind: "reply", id: "x" })).toEqual({
      ok: false,
      error: "Unknown post.",
    });
  });
});

describe("hiddenThread", () => {
  const hidden = {
    id: "42",
    title: "Gone",
    categoryId: "2",
    categoryName: "Engineering",
    hiddenAt: new Date("2026-10-13T12:00:00Z"),
  };

  it("describes a hidden thread to its staff", async () => {
    q.hiddenThread.mockResolvedValue(hidden);
    expect(await a.hiddenThread({ id: "42" })).toEqual({
      ok: true,
      thread: {
        id: "42",
        title: "Gone",
        categoryName: "Engineering",
        hiddenAt: "2026-10-13T12:00:00.000Z",
      },
    });
  });

  it("tells everyone else nothing", async () => {
    q.hiddenThread.mockResolvedValue(hidden);
    getCurrentUser.mockResolvedValue(moderatorOf("4"));
    expect(await a.hiddenThread({ id: "42" })).toEqual({ ok: false });
    getCurrentUser.mockResolvedValue(member);
    expect(await a.hiddenThread({ id: "42" })).toEqual({ ok: false });
    q.hiddenThread.mockResolvedValue(null);
    getCurrentUser.mockResolvedValue(superuser);
    expect(await a.hiddenThread({ id: "42" })).toEqual({ ok: false });
    expect(await a.hiddenThread({ id: "nope" })).toEqual({ ok: false });
  });
});

describe("lockThread / pinThread", () => {
  it("locks and unlocks", async () => {
    expect(await a.lockThread({ id: "42", on: true })).toEqual({
      ok: true,
      message: "Thread locked",
    });
    expect(m.setLocked).toHaveBeenCalledWith({
      threadId: "42",
      categoryId: "2",
      actorId: "u-mod",
      on: true,
    });
    expect(tags()).toEqual(["category:engineering", "thread:42"]);
    expect(await a.lockThread({ id: "42", on: false })).toEqual({
      ok: true,
      message: "Thread unlocked",
    });
  });

  it("pins and unpins", async () => {
    expect(await a.pinThread({ id: "42", on: true })).toEqual({
      ok: true,
      message: "Thread pinned",
    });
    expect(await a.pinThread({ id: "42", on: false })).toEqual({
      ok: true,
      message: "Thread unpinned",
    });
    expect(m.setPinned).toHaveBeenCalledTimes(2);
  });

  it("looks the thread up as a thread", async () => {
    await a.pinThread({ id: "42", on: true });
    expect(q.targetForModeration).toHaveBeenCalledWith("thread", "42");
  });

  it("rejects bad input", async () => {
    expect(await a.lockThread({ id: "42" })).toEqual({ ok: false, error: "Unknown state." });
    expect(await a.pinThread({ id: "0", on: true })).toEqual({
      ok: false,
      error: "Unknown thread.",
    });
  });

  it("refuses when the thread moved since the check", async () => {
    m.setPinned.mockResolvedValue("stale");
    expect(await a.pinThread({ id: "42", on: true })).toMatchObject({ ok: false });
  });
});

describe("moveTargets", () => {
  it("lists the other categories this moderator moderates", async () => {
    getCurrentUser.mockResolvedValue(moderatorOf("2", "4"));
    expect(await a.moveTargets({ id: "42" })).toEqual({
      ok: true,
      categories: [{ slug: "games", name: "Games" }],
    });
  });

  it("lists every other category for a superuser", async () => {
    getCurrentUser.mockResolvedValue(superuser);
    const r = await a.moveTargets({ id: "42" });
    expect(r.ok && r.categories.map((c) => c.slug)).toEqual(["announcements", "general", "games"]);
  });

  it("lists none for a moderator of one category", async () => {
    expect(await a.moveTargets({ id: "42" })).toEqual({ ok: true, categories: [] });
  });

  it("rejects bad input", async () => {
    expect(await a.moveTargets({})).toEqual({ ok: false, error: "Unknown thread." });
  });
});

describe("moveThread", () => {
  it("moves, refreshes both categories and answers with the new address", async () => {
    getCurrentUser.mockResolvedValue(moderatorOf("2", "4"));
    expect(await a.moveThread({ id: "42", category: "games" })).toEqual({
      ok: true,
      message: "Thread moved to Games",
      href: "/forum/games/42",
    });
    expect(m.moveThread).toHaveBeenCalledWith({
      threadId: "42",
      from: { id: "2", slug: "engineering" },
      to: { id: "4", slug: "games" },
      actorId: "u-mod",
    });
    expect(tags()).toEqual(["forum", "category:engineering", "thread:42", "category:games"]);
  });

  it("needs the moderator to moderate the destination too", async () => {
    expect(await a.moveThread({ id: "42", category: "games" })).toEqual({
      ok: false,
      error: "You can't move threads into Games.",
    });
    expect(m.moveThread).not.toHaveBeenCalled();
  });

  it("needs the moderator to moderate the source", async () => {
    getCurrentUser.mockResolvedValue(moderatorOf("4"));
    expect(await a.moveThread({ id: "42", category: "games" })).toEqual(NOT_ALLOWED);
  });

  it("refuses an unknown or the same category", async () => {
    getCurrentUser.mockResolvedValue(superuser);
    expect(await a.moveThread({ id: "42", category: "nowhere" })).toEqual({
      ok: false,
      error: "Pick a category.",
    });
    expect(await a.moveThread({ id: "42", category: "engineering" })).toEqual({
      ok: false,
      error: "This thread is already in Engineering.",
    });
    expect(await a.moveThread({ id: "42", category: "Not A Slug" })).toEqual({
      ok: false,
      error: "Pick a category.",
    });
    expect(m.moveThread).not.toHaveBeenCalled();
  });

  it("refuses when the thread moved meanwhile", async () => {
    getCurrentUser.mockResolvedValue(superuser);
    m.moveThread.mockResolvedValue("stale");
    expect(await a.moveThread({ id: "42", category: "games" })).toMatchObject({ ok: false });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("refuses when the thread is gone", async () => {
    q.targetForModeration.mockResolvedValue(null);
    expect(await a.moveThread({ id: "42", category: "games" })).toMatchObject({ ok: false });
  });
});
