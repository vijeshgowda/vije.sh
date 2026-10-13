import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/authz";

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
const updateTag = vi.fn();
const refresh = vi.fn();
vi.mock("next/cache", () => ({ updateTag, refresh, cacheLife: vi.fn(), cacheTag: vi.fn() }));
const getCurrentUser = vi.fn();
vi.mock("@/features/auth/session", () => ({ getCurrentUser: () => getCurrentUser() }));
const renderNotePreview = vi.fn();
vi.mock("../server/render", () => ({ renderNotePreview: (b: string) => renderNotePreview(b) }));
const m = {
  createNote: vi.fn(),
  updateNote: vi.fn(),
  publishNote: vi.fn(),
  unpublishNote: vi.fn(),
  deleteNote: vi.fn(),
};
vi.mock("./mutations", async (orig) => ({
  ...(await orig<typeof import("./mutations")>()),
  createNote: (...a: unknown[]) => m.createNote(...a),
  updateNote: (...a: unknown[]) => m.updateNote(...a),
  publishNote: (...a: unknown[]) => m.publishNote(...a),
  unpublishNote: (...a: unknown[]) => m.unpublishNote(...a),
  deleteNote: (...a: unknown[]) => m.deleteNote(...a),
}));

const { NoteSlugTakenError } = await import("./mutations");
const {
  createNoteAction,
  deleteNoteAction,
  previewNoteAction,
  publishNoteAction,
  unpublishNoteAction,
  updateNoteAction,
} = await import("./actions");

const user = (roles: CurrentUser["roles"]): CurrentUser => ({
  id: "u1",
  handle: "someone",
  onboarded: true,
  banned: false,
  roles,
});
const OWNER = user([{ role: "admin", categoryId: null }]);
const SUPERUSER = user([{ role: "superuser", categoryId: null }]);

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const NOTE = {
  title: "A note",
  slug: "a-note",
  summary: "",
  tags: "one, two",
  visibility: "public",
  bodyMd: "Body",
};

async function redirectOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof Redirect)) throw new Error(`expected a redirect, got ${String(err)}`);
  return err.url;
}

const tagsUpdated = () => updateTag.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(OWNER);
});

describe("createNoteAction", () => {
  it("creates a draft as the owner and opens it", async () => {
    m.createNote.mockResolvedValue({ id: "7", slug: "a-note" });
    expect(await redirectOf(createNoteAction({}, form(NOTE)))).toBe("/admin/notes/7");
    expect(m.createNote).toHaveBeenCalledWith("u1", {
      title: "A note",
      slug: "a-note",
      summary: null,
      tags: ["one", "two"],
      visibility: "public",
      bodyMd: "Body",
    });
    // a draft is in no cached read
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("returns the first invalid field before checking the user", async () => {
    expect(await createNoteAction({}, form({ ...NOTE, title: " " }))).toEqual({
      field: "title",
      error: "Title is required.",
    });
    expect(await createNoteAction({}, form({ ...NOTE, slug: "planning-this-site" }))).toEqual({
      field: "slug",
      error: "Slug is already used by a post in content/blog.",
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("treats missing fields as empty", async () => {
    expect(await createNoteAction({}, new FormData())).toMatchObject({ field: "slug" });
  });

  it("refuses anyone but the owner", async () => {
    for (const u of [null, SUPERUSER]) {
      getCurrentUser.mockResolvedValue(u);
      expect(await createNoteAction({}, form(NOTE))).toEqual({
        error: "Only the site owner can edit notes.",
      });
    }
    expect(m.createNote).not.toHaveBeenCalled();
  });

  it("reports a slug another note took", async () => {
    m.createNote.mockRejectedValue(new NoteSlugTakenError("a-note", "note"));
    expect(await createNoteAction({}, form(NOTE))).toEqual({
      field: "slug",
      error: "Slug is already used by another note.",
    });
    m.createNote.mockRejectedValue(new Error("db down"));
    await expect(createNoteAction({}, form(NOTE))).rejects.toThrow("db down");
  });
});

describe("updateNoteAction", () => {
  it("saves a draft and refreshes only the editor", async () => {
    m.updateNote.mockResolvedValue({ slug: "a-note", previousSlug: "a-note", status: "draft" });
    expect(await updateNoteAction({}, form({ ...NOTE, id: "7" }))).toEqual({ message: "Saved." });
    expect(m.updateNote).toHaveBeenCalledWith("7", expect.objectContaining({ slug: "a-note" }));
    expect(updateTag).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes a published note under its old and new slug", async () => {
    m.updateNote.mockResolvedValue({ slug: "a-note", previousSlug: "old", status: "published" });
    await updateNoteAction({}, form({ ...NOTE, id: "7" }));
    expect(tagsUpdated()).toEqual(["notes", "note:a-note", "note:old"]);
  });

  it("rejects bad ids, bad input, other users, missing notes and taken slugs", async () => {
    expect(await updateNoteAction({}, form({ ...NOTE, id: "x" }))).toEqual({
      error: "This note no longer exists.",
    });
    expect(await updateNoteAction({}, form({ ...NOTE, id: "7", visibility: "secret" }))).toEqual(
      expect.objectContaining({ field: "visibility" }),
    );
    getCurrentUser.mockResolvedValueOnce(SUPERUSER);
    expect(await updateNoteAction({}, form({ ...NOTE, id: "7" }))).toEqual({
      error: "Only the site owner can edit notes.",
    });
    m.updateNote.mockResolvedValueOnce(null);
    expect(await updateNoteAction({}, form({ ...NOTE, id: "7" }))).toEqual({
      error: "This note no longer exists.",
    });
    m.updateNote.mockRejectedValueOnce(new NoteSlugTakenError("a-note", "git"));
    expect(await updateNoteAction({}, form({ ...NOTE, id: "7" }))).toEqual({
      field: "slug",
      error: "Slug is already used by a post in content/blog.",
    });
    m.updateNote.mockRejectedValueOnce(new Error("db down"));
    await expect(updateNoteAction({}, form({ ...NOTE, id: "7" }))).rejects.toThrow("db down");
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("previewNoteAction", () => {
  it("renders the unsaved body for the owner", async () => {
    renderNotePreview.mockResolvedValue("rendered");
    expect(await previewNoteAction({}, form({ bodyMd: "# Hi\r\n" }))).toEqual({
      source: "# Hi\n",
      body: "rendered",
    });
    expect(renderNotePreview).toHaveBeenCalledWith("# Hi\n");
    renderNotePreview.mockResolvedValue("empty");
    expect(await previewNoteAction({}, new FormData())).toMatchObject({ source: "" });
  });

  it("refuses over-long bodies and other users", async () => {
    expect((await previewNoteAction({}, form({ bodyMd: "x".repeat(100_001) }))).error).toMatch(
      /^Body /,
    );
    getCurrentUser.mockResolvedValue(SUPERUSER);
    expect(await previewNoteAction({}, form({ bodyMd: "x" }))).toEqual({
      error: "Only the site owner can edit notes.",
    });
    expect(renderNotePreview).not.toHaveBeenCalled();
  });
});

describe("publish, unpublish and delete", () => {
  it("publishes and refreshes the note everywhere", async () => {
    m.publishNote.mockResolvedValue({ slug: "a-note" });
    expect(await publishNoteAction({}, form({ id: "7" }))).toEqual({ message: "Published." });
    expect(m.publishNote).toHaveBeenCalledWith("7");
    expect(tagsUpdated()).toEqual(["notes", "note:a-note"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("explains a git post that took the slug since", async () => {
    m.publishNote.mockRejectedValue(new NoteSlugTakenError("a-note", "git"));
    expect(await publishNoteAction({}, form({ id: "7" }))).toEqual({
      error: "Slug is already used by a post in content/blog. Change it before publishing.",
    });
    m.publishNote.mockRejectedValue(new Error("db down"));
    await expect(publishNoteAction({}, form({ id: "7" }))).rejects.toThrow("db down");
  });

  it("unpublishes", async () => {
    m.unpublishNote.mockResolvedValue({ slug: "a-note" });
    expect(await unpublishNoteAction({}, form({ id: "7" }))).toEqual({
      message: "Moved back to drafts.",
    });
    expect(tagsUpdated()).toEqual(["notes", "note:a-note"]);
  });

  it("deletes and returns to the list", async () => {
    m.deleteNote.mockResolvedValue({ slug: "a-note" });
    expect(await redirectOf(deleteNoteAction({}, form({ id: "7" })))).toBe("/admin/notes");
    expect(tagsUpdated()).toEqual(["notes", "note:a-note"]);
  });

  it.each([
    ["publish", publishNoteAction, m.publishNote],
    ["unpublish", unpublishNoteAction, m.unpublishNote],
    ["delete", deleteNoteAction, m.deleteNote],
  ] as const)("%s refuses bad ids, other users and missing notes", async (_, action, mutation) => {
    expect(await action({}, form({ id: "0" }))).toEqual({ error: "This note no longer exists." });
    expect(await action({}, new FormData())).toEqual({ error: "This note no longer exists." });
    getCurrentUser.mockResolvedValueOnce(null);
    expect(await action({}, form({ id: "7" }))).toEqual({
      error: "Only the site owner can edit notes.",
    });
    expect(mutation).not.toHaveBeenCalled();
    mutation.mockResolvedValueOnce(null);
    expect(await action({}, form({ id: "7" }))).toEqual({ error: "This note no longer exists." });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
