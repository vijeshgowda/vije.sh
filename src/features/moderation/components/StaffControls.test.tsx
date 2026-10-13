import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/layout/Toaster";
import type { Me } from "@/features/auth/components/UserMenu";
import { resetMe } from "@/features/forum/client/me";
import type { ToolbarFrame, ToolbarThread } from "@/features/forum/client/toolbar";
import { FrameToolbar } from "@/features/forum/components/FrameToolbar";
import { HiddenThreadNotice } from "./HiddenThreadNotice";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const params = vi.hoisted(() => ({ value: { category: "engineering", thread: "42" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/forum/engineering/42",
  useRouter: () => router,
  useParams: () => params.value,
}));
const reloadPage = vi.hoisted(() => vi.fn());
vi.mock("../client/reload", () => ({ reloadPage }));
vi.mock("@/features/forum/actions", () => ({ editPost: vi.fn(), loadEditSource: vi.fn() }));
const actions = vi.hoisted(() => ({
  hidePost: vi.fn(),
  unhidePost: vi.fn(),
  revealPost: vi.fn(),
  hiddenThread: vi.fn(),
  lockThread: vi.fn(),
  pinThread: vi.fn(),
  moveTargets: vi.fn(),
  moveThread: vi.fn(),
}));
vi.mock("../actions", () => actions);

beforeAll(() => {
  // jsdom has <dialog> but not the modal methods
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const member: Me = {
  handle: "ada",
  displayName: "Ada",
  onboarded: true,
  banned: false,
  roles: [],
  grants: [],
};
const moderatorOf = (...categoryIds: (string | null)[]): Me => ({
  ...member,
  handle: "mod",
  roles: ["moderator"],
  grants: categoryIds.map((categoryId) => ({ role: "moderator", categoryId })),
});
const superuser: Me = {
  ...member,
  handle: "root",
  roles: ["superuser"],
  grants: [{ role: "superuser", categoryId: null }],
};

function session(user: Me | null) {
  document.cookie = user ? "test_session=x; path=/" : "test_session=; max-age=0; path=/";
  const fetch = vi.fn(async () => Response.json({ user }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMe();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "test_session=; max-age=0; path=/";
});

// the thread is in engineering (id 2); the frame's author is someone else
const opening: ToolbarFrame = {
  key: "thread-42",
  kind: "thread",
  id: "42",
  no: 0,
  hidden: false,
  authorHandle: "bob",
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
};
const reply: ToolbarFrame = { ...opening, key: "reply-7", kind: "reply", id: "7", no: 3 };
const hiddenReply: ToolbarFrame = { ...reply, hidden: true, authorHandle: null };
const thread: ToolbarThread = {
  id: "42",
  categoryId: "2",
  categorySlug: "engineering",
  locked: false,
  pinned: false,
};

const buttons = (group: HTMLElement) =>
  within(group)
    .getAllByRole("button")
    .map((b) => b.textContent);

async function toolbar(frame: ToolbarFrame, t: ToolbarThread = thread) {
  render(
    <>
      <FrameToolbar frame={frame} thread={t} />
      <Toaster />
    </>,
  );
  return screen.findByRole("group");
}

describe("StaffControls in the frame toolbar", () => {
  it.each([
    ["a member", member],
    ["a moderator of another category", moderatorOf("4")],
    ["a banned moderator", { ...moderatorOf(null), banned: true }],
  ])("shows nothing to %s", async (_, me) => {
    session(me);
    const { container } = render(<FrameToolbar frame={opening} thread={thread} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("gives a category moderator Hide, Lock and Pin on frame 00 but nowhere to move it", async () => {
    session(moderatorOf("2"));
    expect(buttons(await toolbar(opening))).toEqual(["Hide thread", "Lock", "Pin"]);
  });

  it("gives a global moderator and a superuser Move as well; locked and pinned show the undo", async () => {
    session(moderatorOf(null));
    const group = await toolbar(opening, { ...thread, locked: true, pinned: true });
    expect(buttons(group)).toEqual(["Hide thread", "Unlock", "Unpin", "Move"]);
  });

  it("offers Hide on a visible reply and Reveal and Unhide on a hidden one", async () => {
    session(superuser);
    const { unmount } = render(<FrameToolbar frame={reply} thread={thread} />);
    expect(buttons(await screen.findByRole("group", { name: "FRAME 03 tools" }))).toEqual(["Hide"]);
    unmount();
    render(<FrameToolbar frame={hiddenReply} thread={thread} />);
    expect(buttons(await screen.findByRole("group"))).toEqual(["Reveal", "Unhide"]);
  });

  it("hides a reply after confirming, with a reason, and puts focus back", async () => {
    session(moderatorOf("2"));
    actions.hidePost.mockResolvedValue({ ok: true, message: "Reply hidden" });
    const user = userEvent.setup();
    const group = await toolbar(reply);
    const hide = within(group).getByRole("button", { name: "Hide" });
    await user.click(hide);
    const dialog = screen.getByRole("dialog", { name: "Hide FRAME 03" });
    const reason = within(dialog).getByLabelText("Reason (optional, logged)");
    expect(reason).toHaveFocus();
    await user.type(reason, "Spam link");
    await user.click(within(dialog).getByRole("button", { name: "Hide" }));
    expect(actions.hidePost).toHaveBeenCalledWith({ kind: "reply", id: "7", note: "Spam link" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Reply hidden")).toBeInTheDocument();
    expect(hide).toHaveFocus();
  });

  it("keeps the dialog and the reason when hiding fails", async () => {
    session(moderatorOf("2"));
    actions.hidePost.mockResolvedValue({ ok: false, error: "You can't moderate this post." });
    const user = userEvent.setup();
    await user.click(within(await toolbar(opening)).getByRole("button", { name: "Hide thread" }));
    const dialog = screen.getByRole("dialog", { name: "Hide thread" });
    await user.type(within(dialog).getByLabelText(/Reason/), "Off topic");
    await user.click(within(dialog).getByRole("button", { name: "Hide" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You can't moderate this post.",
    );
    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue("Off topic");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unhides in one click and toasts the result", async () => {
    session(moderatorOf("2"));
    actions.unhidePost.mockResolvedValue({ ok: true, message: "Reply visible again" });
    const user = userEvent.setup();
    await user.click(within(await toolbar(hiddenReply)).getByRole("button", { name: "Unhide" }));
    expect(actions.unhidePost).toHaveBeenCalledWith({ kind: "reply", id: "7" });
    expect(await screen.findByText("Reply visible again")).toBeInTheDocument();
  });

  it("toasts a one-click failure, and a thrown action as a generic error", async () => {
    session(moderatorOf("2"));
    actions.lockThread.mockResolvedValueOnce({ ok: false, error: "Reload and try again." });
    actions.pinThread.mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    const group = await toolbar(opening);
    await user.click(within(group).getByRole("button", { name: "Lock" }));
    expect(actions.lockThread).toHaveBeenCalledWith({ id: "42", on: true });
    expect(await screen.findByText("Reload and try again.")).toBeInTheDocument();
    await user.click(within(group).getByRole("button", { name: "Pin" }));
    expect(actions.pinThread).toHaveBeenCalledWith({ id: "42", on: true });
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });

  it("unlocks and unpins", async () => {
    session(moderatorOf("2"));
    actions.lockThread.mockResolvedValue({ ok: true, message: "Thread unlocked" });
    actions.pinThread.mockResolvedValue({ ok: true, message: "Thread unpinned" });
    const user = userEvent.setup();
    const group = await toolbar(opening, { ...thread, locked: true, pinned: true });
    await user.click(within(group).getByRole("button", { name: "Unlock" }));
    await user.click(within(group).getByRole("button", { name: "Unpin" }));
    expect(actions.lockThread).toHaveBeenCalledWith({ id: "42", on: false });
    expect(actions.pinThread).toHaveBeenCalledWith({ id: "42", on: false });
  });

  it("reveals hidden text as plain text in a <pre>, never as HTML", async () => {
    session(moderatorOf("2"));
    actions.revealPost.mockResolvedValue({
      ok: true,
      title: null,
      body: "<img src=x onerror=alert(1)> **bold**",
      authorHandle: "bob",
    });
    const user = userEvent.setup();
    await user.click(within(await toolbar(hiddenReply)).getByRole("button", { name: "Reveal" }));
    const dialog = screen.getByRole("dialog", { name: "Hidden FRAME 03" });
    expect(actions.revealPost).toHaveBeenCalledWith({ kind: "reply", id: "7" });
    const pre = await within(dialog).findByLabelText("Hidden text");
    expect(pre.tagName).toBe("PRE");
    expect(pre).toHaveTextContent("<img src=x onerror=alert(1)> **bold**");
    expect(pre.querySelector("img")).toBeNull();
    expect(dialog).toHaveTextContent("By @bob");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says why a reveal failed", async () => {
    session(moderatorOf("2"));
    actions.revealPost.mockResolvedValueOnce({
      ok: false,
      error: "This post isn't hidden any more.",
    });
    const user = userEvent.setup();
    await user.click(within(await toolbar(hiddenReply)).getByRole("button", { name: "Reveal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This post isn't hidden any more.");
  });

  it("moves a thread to a category picked from the server's list, then follows it", async () => {
    session(moderatorOf("2", "4"));
    actions.moveTargets.mockResolvedValue({
      ok: true,
      categories: [{ slug: "games", name: "Games" }],
    });
    actions.moveThread.mockResolvedValue({
      ok: true,
      message: "Thread moved to Games",
      href: "/forum/games/42",
    });
    const user = userEvent.setup();
    await user.click(within(await toolbar(opening)).getByRole("button", { name: "Move" }));
    const dialog = screen.getByRole("dialog", { name: "Move thread" });
    expect(actions.moveTargets).toHaveBeenCalledWith({ id: "42" });
    const select = await within(dialog).findByLabelText("Category");
    expect(select).toHaveValue("games");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(actions.moveThread).toHaveBeenCalledWith({ id: "42", category: "games" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/forum/games/42"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can't move when there's nowhere to go", async () => {
    session(moderatorOf(null));
    actions.moveTargets.mockResolvedValue({ ok: true, categories: [] });
    const user = userEvent.setup();
    await user.click(within(await toolbar(opening)).getByRole("button", { name: "Move" }));
    const dialog = screen.getByRole("dialog", { name: "Move thread" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You don't moderate another category.",
    );
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeDisabled();
  });

  it("shows a failed category load", async () => {
    session(superuser);
    actions.moveTargets.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    await user.click(within(await toolbar(opening)).getByRole("button", { name: "Move" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the categories.");
  });
});

describe("HiddenThreadNotice", () => {
  const hidden = {
    ok: true,
    thread: {
      id: "42",
      title: "Off-topic thread",
      categoryName: "Engineering",
      hiddenAt: "2026-10-13T12:00:00.000Z",
    },
  };

  it("asks nothing for guests and members", async () => {
    session(member);
    const { container } = render(<HiddenThreadNotice />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(actions.hiddenThread).not.toHaveBeenCalled();
  });

  it("shows nothing when the server says no", async () => {
    session(moderatorOf("4"));
    actions.hiddenThread.mockResolvedValue({ ok: false });
    const { container } = render(<HiddenThreadNotice />);
    await waitFor(() => expect(actions.hiddenThread).toHaveBeenCalledWith({ id: "42" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("ignores a malformed thread address", async () => {
    session(superuser);
    params.value = { category: "engineering", thread: "x" };
    render(<HiddenThreadNotice />);
    await act(async () => {});
    expect(actions.hiddenThread).not.toHaveBeenCalled();
    params.value = { category: "engineering", thread: "42" };
  });

  it("offers its staff Reveal and Unhide", async () => {
    session(moderatorOf("2"));
    actions.hiddenThread.mockResolvedValue(hidden);
    actions.revealPost.mockResolvedValue({
      ok: true,
      title: "Off-topic thread",
      body: "Raw body",
      authorHandle: null,
    });
    actions.unhidePost.mockResolvedValue({ ok: true, message: "Thread visible again" });
    const user = userEvent.setup();
    render(
      <>
        <HiddenThreadNotice />
        <Toaster />
      </>,
    );
    const notice = await screen.findByRole("region", { name: "Off-topic thread" });
    expect(notice).toHaveTextContent("0x2A");
    expect(notice).toHaveTextContent("13 Oct 2026, 12:00 UTC");

    await user.click(within(notice).getByRole("button", { name: "Reveal" }));
    const dialog = screen.getByRole("dialog", { name: "Hidden thread" });
    expect(await within(dialog).findByLabelText("Hidden text")).toHaveTextContent("Raw body");
    expect(dialog).toHaveTextContent("By a deleted account");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.click(within(notice).getByRole("button", { name: "Unhide thread" }));
    expect(actions.unhidePost).toHaveBeenCalledWith({ kind: "thread", id: "42" });
    await waitFor(() => expect(reloadPage).toHaveBeenCalled());
    expect(await screen.findByText("Thread visible again")).toBeInTheDocument();
  });

  it("shows an unhide failure", async () => {
    session(superuser);
    actions.hiddenThread.mockResolvedValue(hidden);
    actions.unhidePost.mockResolvedValue({ ok: false, error: "Reload and try again." });
    const user = userEvent.setup();
    render(<HiddenThreadNotice />);
    const notice = await screen.findByRole("region");
    await user.click(within(notice).getByRole("button", { name: "Unhide thread" }));
    expect(await within(notice).findByRole("alert")).toHaveTextContent("Reload and try again.");
  });
});
