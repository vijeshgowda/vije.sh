import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/features/auth/queries";
import { DAY_MS, HOUR_MS } from "@/lib/rate-limit";
import { EDIT_WINDOW_MS } from "@/lib/authz";
import { INITIAL_POST_STATE, type PostFormState } from "./form-state";

class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
const updateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ updateTag }));
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/session", () => ({ getCurrentUser }));
const q = vi.hoisted(() => ({
  categoryForPost: vi.fn(),
  threadForReply: vi.fn(),
  postForEdit: vi.fn(),
  countRecentThreads: vi.fn(),
  countRecentReplies: vi.fn(),
}));
vi.mock("./queries", () => ({
  ...q,
  categoryTag: (slug: string) => `category:${slug}`,
  threadTag: (id: string) => `thread:${id}`,
}));
const m = vi.hoisted(() => ({
  insertThread: vi.fn(),
  insertReply: vi.fn(),
  updateThread: vi.fn(),
  updateReply: vi.fn(),
}));
vi.mock("./mutations", () => m);

const { createReply, createThread, editPost, loadEditSource } = await import("./actions");

const form = (fields: Record<string, string | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.set(k, v);
  return f;
};

const old = new Date(Date.now() - 2 * DAY_MS);
const member: SessionUser = {
  id: "u-member",
  handle: "ada",
  displayName: null,
  onboarded: true,
  banned: false,
  createdAt: old,
  roles: [],
};
const as = (over: Partial<SessionUser> = {}): SessionUser => ({ ...member, ...over });
const moderatorOf = (categoryId: string | null) =>
  as({ id: "u-mod", roles: [{ role: "moderator", categoryId }] });
const owner = as({ id: "u-owner", roles: [{ role: "admin", categoryId: null }] });

const PREV: PostFormState = { ...INITIAL_POST_STATE, seq: 4 };

async function redirectOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof Redirect)) throw new Error(`expected a redirect, got ${String(err)}`);
  return err.url;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(member);
  q.countRecentThreads.mockResolvedValue(0);
  q.countRecentReplies.mockResolvedValue(0);
});

describe("createThread", () => {
  const games = { id: "4", slug: "games", name: "Games", staffOnly: false };
  const news = { id: "1", slug: "announcements", name: "Announcements", staffOnly: true };
  const fields = { category: "games", title: "Pooling with pg", body: "Use **one**." };
  const values = { category: "games", title: "Pooling with pg", body: "Use **one**." };

  it("posts, refreshes the category and goes to the new thread", async () => {
    q.categoryForPost.mockResolvedValue(games);
    m.insertThread.mockResolvedValue("42");
    expect(await redirectOf(createThread(PREV, form(fields)))).toBe("/forum/games/42");
    expect(q.categoryForPost).toHaveBeenCalledWith("games");
    expect(q.countRecentThreads).toHaveBeenCalledWith("u-member", HOUR_MS);
    expect(m.insertThread).toHaveBeenCalledWith({
      categoryId: "4",
      authorId: "u-member",
      title: "Pooling with pg",
      body: "Use **one**.",
      staff: false,
    });
    expect(updateTag).toHaveBeenCalledWith("category:games");
  });

  it("returns the first invalid field with what was typed", async () => {
    const res = await createThread(PREV, form({ ...fields, title: "ab" }));
    expect(res).toEqual({
      seq: 5,
      error: "Use at least 3 characters for the title.",
      field: "title",
      values: { ...values, title: "ab" },
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
    const empty = await createThread(PREV, form({}));
    expect(empty).toMatchObject({
      field: "category",
      values: { category: "", title: "", body: "" },
    });
  });

  it("tells guests, unfinished and banned accounts why they can't post", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect(await createThread(PREV, form(fields))).toEqual({
      seq: 5,
      error: "Sign in to post.",
      values,
    });
    getCurrentUser.mockResolvedValueOnce(as({ onboarded: false, handle: null }));
    expect((await createThread(PREV, form(fields))).error).toBe(
      "Finish signing up before you post.",
    );
    getCurrentUser.mockResolvedValueOnce(as({ banned: true, roles: owner.roles }));
    expect((await createThread(PREV, form(fields))).error).toBe("Your account can't post.");
    expect(q.categoryForPost).not.toHaveBeenCalled();
    expect(m.insertThread).not.toHaveBeenCalled();
  });

  it("rejects unknown categories", async () => {
    q.categoryForPost.mockResolvedValue(null);
    expect(await createThread(PREV, form(fields))).toMatchObject({
      error: "Pick a category.",
      field: "category",
    });
  });

  it("keeps staff-only categories to their staff", async () => {
    q.categoryForPost.mockResolvedValue(news);
    const f = form({ ...fields, category: "announcements" });
    expect(await createThread(PREV, f)).toMatchObject({
      error: "Only staff can start threads in Announcements.",
      field: "category",
    });
    getCurrentUser.mockResolvedValueOnce(moderatorOf("4"));
    expect((await createThread(PREV, f)).error).toMatch(/Only staff/);
    expect(m.insertThread).not.toHaveBeenCalled();

    getCurrentUser.mockResolvedValueOnce(moderatorOf("1"));
    m.insertThread.mockResolvedValue("7");
    expect(await redirectOf(createThread(PREV, f))).toBe("/forum/announcements/7");
    expect(m.insertThread).toHaveBeenCalledWith(expect.objectContaining({ staff: true }));
  });

  it("refuses when the category turned staff-only after the check", async () => {
    q.categoryForPost.mockResolvedValue(games);
    m.insertThread.mockResolvedValue(null);
    expect((await createThread(PREV, form(fields))).error).toBe(
      "Only staff can start threads in Games.",
    );
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("rate-limits new accounts to one thread an hour; staff are exempt", async () => {
    q.categoryForPost.mockResolvedValue(games);
    q.countRecentThreads.mockResolvedValue(1);
    getCurrentUser.mockResolvedValueOnce(as({ createdAt: new Date() }));
    expect(await createThread(PREV, form(fields))).toEqual({
      seq: 5,
      error: "You can start 1 thread an hour while your account is new. Please try again later.",
      values,
    });
    expect(m.insertThread).not.toHaveBeenCalled();

    q.countRecentThreads.mockResolvedValue(50);
    getCurrentUser.mockResolvedValueOnce(moderatorOf("1"));
    m.insertThread.mockResolvedValue("8");
    expect(await redirectOf(createThread(PREV, form(fields)))).toBe("/forum/games/8");
  });
});

describe("createReply", () => {
  const thread = { id: "42", categoryId: "2", categorySlug: "engineering", locked: false };
  const fields = { threadId: "42", body: "Me too\r\n" };

  it("replies and refreshes the thread and its category", async () => {
    q.threadForReply.mockResolvedValue(thread);
    m.insertReply.mockResolvedValue("99");
    expect(await createReply(PREV, form(fields))).toEqual({ seq: 5, ok: true, id: "99" });
    expect(q.countRecentReplies).toHaveBeenCalledWith("u-member", HOUR_MS);
    expect(m.insertReply).toHaveBeenCalledWith({
      threadId: "42",
      authorId: "u-member",
      body: "Me too",
      staff: false,
    });
    expect(updateTag).toHaveBeenCalledWith("thread:42");
    expect(updateTag).toHaveBeenCalledWith("category:engineering");
  });

  it("validates before reading the session", async () => {
    expect(await createReply(PREV, form({ threadId: "42", body: "  " }))).toEqual({
      seq: 5,
      error: "Write a message.",
      field: "body",
      values: { body: "  " },
    });
    expect((await createReply(PREV, form({ threadId: "abc", body: "x" }))).error).toBe(
      "Unknown thread.",
    );
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses guests and missing threads", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await createReply(PREV, form(fields))).error).toBe("Sign in to post.");
    q.threadForReply.mockResolvedValue(null);
    expect((await createReply(PREV, form(fields))).error).toBe(
      "This thread is no longer available.",
    );
    expect(m.insertReply).not.toHaveBeenCalled();
  });

  it("lets only staff of the category reply in a locked thread", async () => {
    q.threadForReply.mockResolvedValue({ ...thread, locked: true });
    expect(await createReply(PREV, form(fields))).toEqual({
      seq: 5,
      error: "This thread is locked.",
      values: { body: "Me too\r\n" },
    });
    getCurrentUser.mockResolvedValueOnce(moderatorOf("2"));
    m.insertReply.mockResolvedValue("100");
    expect(await createReply(PREV, form(fields))).toMatchObject({ ok: true, id: "100" });
    expect(m.insertReply).toHaveBeenCalledWith(expect.objectContaining({ staff: true }));
  });

  it("rate-limits replies", async () => {
    q.threadForReply.mockResolvedValue(thread);
    q.countRecentReplies.mockResolvedValue(30);
    expect((await createReply(PREV, form(fields))).error).toBe(
      "You can post 30 replies an hour. Please try again later.",
    );
    expect(m.insertReply).not.toHaveBeenCalled();
  });

  it("reports a thread locked or hidden after the check", async () => {
    q.threadForReply.mockResolvedValue(thread);
    m.insertReply.mockResolvedValue(null);
    expect((await createReply(PREV, form(fields))).error).toBe(
      "This thread is locked or no longer available.",
    );
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  const recent = () => new Date(Date.now() - 60_000);
  const threadPost = (over = {}) => ({
    kind: "thread",
    id: "42",
    threadId: "42",
    categoryId: "2",
    categorySlug: "engineering",
    authorId: "u-member",
    createdAt: recent(),
    title: "Old title",
    body: "Old body",
    ...over,
  });
  const replyPost = (over = {}) =>
    threadPost({ kind: "reply", id: "9", title: null, body: "Old reply", ...over });

  describe("loadEditSource", () => {
    it("returns the stored source to its author within the window", async () => {
      q.postForEdit.mockResolvedValue(threadPost());
      expect(await loadEditSource({ kind: "thread", id: "42" })).toEqual({
        ok: true,
        title: "Old title",
        body: "Old body",
      });
      expect(q.postForEdit).toHaveBeenCalledWith("thread", "42");
    });

    it("refuses bad refs, guests, missing posts, other authors and closed windows", async () => {
      expect(await loadEditSource({ kind: "x", id: "42" })).toEqual({
        ok: false,
        error: "This post is no longer available.",
      });
      getCurrentUser.mockResolvedValueOnce(null);
      expect(await loadEditSource({ kind: "reply", id: "9" })).toEqual({
        ok: false,
        error: "Sign in to post.",
      });
      q.postForEdit.mockResolvedValueOnce(null);
      expect((await loadEditSource({ kind: "reply", id: "9" })) as unknown).toEqual({
        ok: false,
        error: "This post is no longer available.",
      });
      q.postForEdit.mockResolvedValueOnce(replyPost({ authorId: "u-other" }));
      expect(await loadEditSource({ kind: "reply", id: "9" })).toEqual({
        ok: false,
        error: "You can only edit your own posts.",
      });
      q.postForEdit.mockResolvedValueOnce(
        replyPost({ createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1000) }),
      );
      expect(await loadEditSource({ kind: "reply", id: "9" })).toEqual({
        ok: false,
        error: "The 30-minute edit window has closed.",
      });
    });

    it("lets the owner load any post", async () => {
      getCurrentUser.mockResolvedValueOnce(owner);
      q.postForEdit.mockResolvedValue(replyPost({ authorId: "u-other", createdAt: old }));
      expect(await loadEditSource({ kind: "reply", id: "9" })).toEqual({
        ok: true,
        title: null,
        body: "Old reply",
      });
    });
  });

  describe("editPost", () => {
    it("saves a thread's title and body and refreshes the thread and its category", async () => {
      q.postForEdit.mockResolvedValue(threadPost());
      m.updateThread.mockResolvedValue(true);
      const res = await editPost(
        PREV,
        form({ kind: "thread", id: "42", title: " New  title ", body: "New body" }),
      );
      expect(res).toEqual({ seq: 5, ok: true });
      expect(m.updateThread).toHaveBeenCalledWith({
        id: "42",
        title: "New title",
        body: "New body",
      });
      expect(updateTag.mock.calls).toEqual([["thread:42"], ["category:engineering"]]);
    });

    it("saves a reply's body and refreshes only its thread", async () => {
      q.postForEdit.mockResolvedValue(replyPost());
      m.updateReply.mockResolvedValue(true);
      expect(await editPost(PREV, form({ kind: "reply", id: "9", body: "New" }))).toEqual({
        seq: 5,
        ok: true,
      });
      expect(m.updateReply).toHaveBeenCalledWith({ id: "9", body: "New" });
      expect(updateTag.mock.calls).toEqual([["thread:42"]]);
    });

    it("validates first", async () => {
      expect(
        await editPost(PREV, form({ kind: "thread", id: "42", title: "", body: "B" })),
      ).toEqual({
        seq: 5,
        error: "Use at least 3 characters for the title.",
        field: "title",
        values: { title: "", body: "B" },
      });
      expect(getCurrentUser).not.toHaveBeenCalled();
    });

    it("refuses other authors and closed windows, and posts hidden meanwhile", async () => {
      q.postForEdit.mockResolvedValueOnce(replyPost({ authorId: "u-other" }));
      expect(await editPost(PREV, form({ kind: "reply", id: "9", body: "New" }))).toEqual({
        seq: 5,
        error: "You can only edit your own posts.",
        values: { title: "", body: "New" },
      });
      expect(m.updateReply).not.toHaveBeenCalled();

      q.postForEdit.mockResolvedValueOnce(replyPost());
      m.updateReply.mockResolvedValueOnce(false);
      expect((await editPost(PREV, form({ kind: "reply", id: "9", body: "New" }))).error).toBe(
        "This post is no longer available.",
      );
      expect(updateTag).not.toHaveBeenCalled();
    });
  });
});
