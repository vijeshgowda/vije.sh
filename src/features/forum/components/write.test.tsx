import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/layout/Toaster";
import type { Me } from "@/features/auth/components/UserMenu";
import { EDIT_WINDOW_MS } from "@/lib/authz";
import { resetMe } from "../client/me";
import type { FrameTool, ToolbarFrame, ToolbarThread } from "../client/toolbar";
import type { PostFormState } from "../form-state";
import { FrameToolbar } from "./FrameToolbar";
import { NewThread } from "./NewThread";
import { ReplyForm } from "./ReplyForm";

vi.mock("next/navigation", () => ({ usePathname: () => "/forum/games" }));
const actions = vi.hoisted(() => ({
  createThread: vi.fn(),
  createReply: vi.fn(),
  editPost: vi.fn(),
  loadEditSource: vi.fn(),
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
const moderatorOf = (categoryId: string | null): Me => ({
  ...member,
  handle: "mod",
  roles: ["moderator"],
  grants: [{ role: "moderator", categoryId }],
});
const owner: Me = {
  ...member,
  handle: "vijesh",
  roles: ["admin"],
  grants: [{ role: "admin", categoryId: null }],
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

const categories = [
  { id: "1", slug: "announcements", name: "Announcements", staffOnly: true },
  { id: "2", slug: "engineering", name: "Engineering", staffOnly: false },
  { id: "4", slug: "games", name: "Games", staffOnly: false },
];

describe("NewThread", () => {
  it("sends guests to sign in, coming back here", async () => {
    const fetch = session(null);
    render(<NewThread categories={categories} />);
    expect(await screen.findByRole("link", { name: "Sign in to post" })).toHaveAttribute(
      "href",
      "/login?next=%2Fforum%2Fgames",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends unfinished accounts to /welcome and tells banned ones they can't post", async () => {
    session({ ...member, handle: null, onboarded: false });
    const { unmount } = render(<NewThread categories={categories} />);
    expect(await screen.findByRole("link", { name: "Finish sign-up to post" })).toHaveAttribute(
      "href",
      "/welcome?next=%2Fforum%2Fgames",
    );
    unmount();
    resetMe();
    session({ ...member, banned: true });
    render(<NewThread categories={categories} />);
    expect(await screen.findByText("Your account can't post.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New thread" })).toBeNull();
  });

  it("opens a modal form without staff-only categories, focused on the title", async () => {
    session(member);
    const user = userEvent.setup();
    render(<NewThread categories={categories} current="games" />);
    const open = await screen.findByRole("button", { name: "New thread" });
    await user.click(open);
    const dialog = screen.getByRole("dialog", { name: "New thread" });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByLabelText("Title")).toHaveFocus();
    const picker = within(dialog).getByLabelText("Category");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Engineering", "Games"]);
    expect(picker).toHaveValue("games");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();
  });

  it("offers staff-only categories to their staff", async () => {
    session(moderatorOf("1"));
    const user = userEvent.setup();
    render(<NewThread categories={categories} current="announcements" />);
    await user.click(await screen.findByRole("button", { name: "New thread" }));
    const picker = screen.getByLabelText("Category");
    expect(within(picker).getAllByRole("option")).toHaveLength(3);
    expect(picker).toHaveValue("announcements");
  });

  it("preselects the first allowed category when the page's isn't", async () => {
    session(member);
    const user = userEvent.setup();
    render(<NewThread categories={categories} current="announcements" />);
    await user.click(await screen.findByRole("button", { name: "New thread" }));
    expect(screen.getByLabelText("Category")).toHaveValue("engineering");
  });

  it("shows nothing when the member may post in none of the categories", async () => {
    session(member);
    const { container } = render(<NewThread categories={categories.slice(0, 1)} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("announces errors, marks the field and keeps what was typed", async () => {
    session(member);
    actions.createThread.mockImplementation(
      async (prev: PostFormState, f: FormData): Promise<PostFormState> => ({
        seq: prev.seq + 1,
        error: "Use at least 3 characters for the title.",
        field: "title",
        values: {
          category: String(f.get("category")),
          title: String(f.get("title")),
          body: String(f.get("body")),
        },
      }),
    );
    const user = userEvent.setup();
    render(<NewThread categories={categories} current="games" />);
    await user.click(await screen.findByRole("button", { name: "New thread" }));
    const title = screen.getByLabelText("Title");
    await user.type(title, "Hey");
    await user.type(screen.getByLabelText("Message"), "Body text");
    await user.click(screen.getByRole("button", { name: "Transmit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use at least 3 characters for the title.",
    );
    const data = actions.createThread.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(data)).toEqual({
      title: "Hey",
      category: "games",
      body: "Body text",
    });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription(
      "Use at least 3 characters for the title.",
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Hey");
    expect(screen.getByLabelText("Message")).toHaveValue("Body text");
    expect(screen.getByLabelText("Message")).not.toHaveAttribute("aria-invalid");
  });
});

describe("ReplyForm", () => {
  const thread = { id: "42", categoryId: "2", locked: false };

  it("asks guests to sign in and tells banned accounts they can't post", async () => {
    session(null);
    const { unmount } = render(<ReplyForm thread={thread} />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fforum%2Fgames",
    );
    expect(screen.getByText(/to reply\./)).toBeInTheDocument();
    unmount();
    resetMe();
    session({ ...member, banned: true });
    render(<ReplyForm thread={thread} />);
    expect(await screen.findByRole("status")).toHaveTextContent("Your account can't post.");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks unfinished accounts to finish signing up", async () => {
    session({ ...member, handle: null, onboarded: false });
    render(<ReplyForm thread={thread} />);
    expect(await screen.findByRole("link", { name: "Finish signing up" })).toHaveAttribute(
      "href",
      "/welcome?next=%2Fforum%2Fgames",
    );
  });

  it("keeps locked threads to staff", async () => {
    session(member);
    const { unmount } = render(<ReplyForm thread={{ ...thread, locked: true }} />);
    expect(
      await screen.findByText("This thread is locked. Only moderators can reply."),
    ).toBeInTheDocument();
    unmount();
    resetMe();
    session(moderatorOf("2"));
    render(<ReplyForm thread={{ ...thread, locked: true }} />);
    expect(await screen.findByLabelText("Reply")).toBeInTheDocument();
    expect(screen.getByText(/in a locked thread \(staff\)/)).toBeInTheDocument();
  });

  it("posts, clears the box, scrolls to the new frame and says so", async () => {
    session(member);
    const scrolled = vi.fn();
    const frame = document.createElement("li");
    frame.id = "reply-99";
    frame.scrollIntoView = scrolled;
    document.body.append(frame);
    actions.createReply.mockImplementation(async (prev: PostFormState) => ({
      seq: prev.seq + 1,
      ok: true,
      id: "99",
    }));
    const user = userEvent.setup();
    render(
      <>
        <ReplyForm thread={thread} />
        <Toaster />
      </>,
    );
    const box = await screen.findByLabelText("Reply");
    expect(screen.getByText(/Posting as @ada/)).toBeInTheDocument();
    await user.type(box, "Me too");
    await user.click(screen.getByRole("button", { name: "Transmit" }));
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith({ block: "center" }));
    const data = actions.createReply.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(data)).toEqual({ threadId: "42", body: "Me too" });
    expect(box).toHaveValue("");
    expect(await screen.findByText("Reply transmitted")).toBeInTheDocument();
    frame.remove();
  });

  it("shows errors and keeps the text", async () => {
    session(member);
    actions.createReply.mockImplementation(async (prev: PostFormState, f: FormData) => ({
      seq: prev.seq + 1,
      error: "You can post 5 replies an hour while your account is new. Please try again later.",
      values: { body: String(f.get("body")) },
    }));
    const user = userEvent.setup();
    render(<ReplyForm thread={thread} />);
    const box = await screen.findByLabelText("Reply");
    await user.type(box, "Again");
    await user.click(screen.getByRole("button", { name: "Transmit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/5 replies an hour/);
    expect(box).toHaveValue("Again");
    await waitFor(() => expect(box).toHaveFocus());
  });
});

describe("FrameToolbar", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const frame = (over: Partial<ToolbarFrame> = {}): ToolbarFrame => ({
    key: "thread-42",
    kind: "thread",
    id: "42",
    no: 0,
    hidden: false,
    authorHandle: "ada",
    createdAt: ago(60_000),
    ...over,
  });
  const thread: ToolbarThread = {
    id: "42",
    categoryId: "2",
    categorySlug: "engineering",
    locked: false,
    pinned: false,
  };

  it("shows nothing to guests", async () => {
    session(null);
    const { container } = render(<FrameToolbar frame={frame()} thread={thread} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Edit to the author (any letter case) within 30 minutes only", async () => {
    session({ ...member, handle: "ADA" });
    const { rerender } = render(<FrameToolbar frame={frame()} thread={thread} />);
    const group = await screen.findByRole("group", { name: "FRAME 00 tools" });
    expect(within(group).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    rerender(
      <FrameToolbar frame={frame({ createdAt: ago(EDIT_WINDOW_MS + 60_000) })} thread={thread} />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    rerender(<FrameToolbar frame={frame({ hidden: true, authorHandle: null })} thread={thread} />);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("offers nothing on someone else's post, and everything to the owner", async () => {
    session(member);
    const { container, unmount } = render(
      <FrameToolbar frame={frame({ authorHandle: "bob" })} thread={thread} />,
    );
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    unmount();
    resetMe();
    session(owner);
    render(
      <FrameToolbar
        frame={frame({ authorHandle: "bob", createdAt: ago(10 * EDIT_WINDOW_MS) })}
        thread={thread}
      />,
    );
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders extra tools in order, each deciding for itself", async () => {
    session(moderatorOf("2"));
    const tools: FrameTool[] = [
      { id: "a", show: () => true, Tool: ({ frame: f }) => <button>{`Report ${f.key}`}</button> },
      { id: "b", show: ({ thread: t }) => t.locked, Tool: () => <button>Unlock</button> },
      {
        id: "c",
        show: ({ me }) => me.roles.includes("moderator"),
        Tool: () => <button>Hide</button>,
      },
    ];
    render(<FrameToolbar frame={frame()} thread={thread} tools={tools} />);
    const group = await screen.findByRole("group");
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Report thread-42", "Hide"]);
  });

  it("edits a thread in a dialog: loads the source, saves, closes and says so", async () => {
    session(member);
    let loaded!: (v: unknown) => void;
    actions.loadEditSource.mockReturnValue(new Promise((r) => (loaded = r)));
    actions.editPost.mockImplementation(async (prev: PostFormState) => ({
      seq: prev.seq + 1,
      ok: true,
    }));
    const user = userEvent.setup();
    render(
      <>
        <FrameToolbar frame={frame()} thread={thread} />
        <Toaster />
      </>,
    );
    const edit = await screen.findByRole("button", { name: "Edit" });
    await user.click(edit);
    const dialog = screen.getByRole("dialog", { name: "Edit thread" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading");
    expect(actions.loadEditSource).toHaveBeenCalledWith({ kind: "thread", id: "42" });
    act(() => loaded({ ok: true, title: "Old title", body: "Old body" }));
    const title = await within(dialog).findByLabelText("Title");
    expect(title).toHaveValue("Old title");
    expect(title).toHaveFocus();
    const body = within(dialog).getByLabelText("Message");
    expect(body).toHaveValue("Old body");
    await user.clear(body);
    await user.type(body, "New body");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const data = actions.editPost.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(data)).toEqual({
      kind: "thread",
      id: "42",
      title: "Old title",
      body: "New body",
    });
    expect(await screen.findByText("Edit saved")).toBeInTheDocument();
    expect(edit).toHaveFocus();
  });

  it("edits a reply's body only and shows save errors on the field", async () => {
    session(member);
    actions.loadEditSource.mockResolvedValue({ ok: true, title: null, body: "Old" });
    actions.editPost.mockImplementation(async (prev: PostFormState, f: FormData) => ({
      seq: prev.seq + 1,
      error: "Write a message.",
      field: "body",
      values: { title: "", body: String(f.get("body")) },
    }));
    const user = userEvent.setup();
    render(
      <FrameToolbar
        frame={frame({ key: "reply-9", kind: "reply", id: "9", no: 3 })}
        thread={thread}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit FRAME 03" });
    const body = await within(dialog).findByLabelText("Message");
    expect(within(dialog).queryByLabelText("Title")).toBeNull();
    expect(body).toHaveFocus();
    await user.type(body, "!");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Write a message.");
    expect(body).toHaveAttribute("aria-invalid", "true");
    expect(body).toHaveValue("Old!");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains when the post can't be loaded for editing", async () => {
    session(member);
    actions.loadEditSource
      .mockResolvedValueOnce({ ok: false, error: "The 30-minute edit window has closed." })
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<FrameToolbar frame={frame()} thread={thread} />);
    const edit = await screen.findByRole("button", { name: "Edit" });
    await user.click(edit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The 30-minute edit window has closed.",
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(edit).toHaveFocus();
    await user.click(edit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the post.");
    // Esc closes the native dialog
    act(() => (screen.getByRole("dialog") as HTMLDialogElement).close());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("useMe", () => {
  it("asks /api/me once for every island on the page", async () => {
    const fetch = session(member);
    render(
      <>
        <NewThread categories={categories} />
        <ReplyForm thread={{ id: "1", categoryId: "2", locked: false }} />
      </>,
    );
    await screen.findByRole("button", { name: "New thread" });
    await screen.findByLabelText("Reply");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
