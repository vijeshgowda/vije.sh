import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/layout/Toaster";
import type { Me } from "@/features/auth/components/UserMenu";
import { resetMe } from "@/features/forum/client/me";
import type { ToolbarFrame, ToolbarThread } from "@/features/forum/client/toolbar";
import { FrameToolbar } from "@/features/forum/components/FrameToolbar";
import type { LogPage, ReportGroup, ResolvedReport } from "../queries";
import { ModerationLog } from "./ModerationLog";
import { ProfileReport } from "./ProfileReport";
import { ReportQueue } from "./ReportQueue";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/forum/engineering/42",
  useRouter: () => router,
}));
vi.mock("@/features/forum/actions", () => ({ editPost: vi.fn(), loadEditSource: vi.fn() }));
const moderation = vi.hoisted(() => ({
  hidePost: vi.fn(),
  unhidePost: vi.fn(),
  revealPost: vi.fn(),
  lockThread: vi.fn(),
  pinThread: vi.fn(),
  moveTargets: vi.fn(),
  moveThread: vi.fn(),
}));
vi.mock("../../actions", () => moderation);
const reports = vi.hoisted(() => ({ reportContent: vi.fn(), resolveReports: vi.fn() }));
vi.mock("../actions", () => reports);

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
const superuser: Me = {
  ...member,
  handle: "root",
  roles: ["superuser"],
  grants: [{ role: "superuser", categoryId: null }],
};

function session(user: Me | null) {
  document.cookie = user ? "test_session=x; path=/" : "test_session=; max-age=0; path=/";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ user })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMe();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "test_session=; max-age=0; path=/";
});

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
const thread: ToolbarThread = {
  id: "42",
  categoryId: "2",
  categorySlug: "engineering",
  locked: false,
  pinned: false,
};

async function settle() {
  await act(async () => {});
}

describe("Report in the frame toolbar", () => {
  it("shows Report on other members' visible posts", async () => {
    session(member);
    render(<FrameToolbar frame={reply} thread={thread} />);
    expect(await screen.findByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it.each([
    ["a guest", null, reply],
    ["the author (any letter case)", member, { ...reply, authorHandle: "ADA" }],
    ["a hidden post", member, { ...reply, hidden: true, authorHandle: null }],
    ["a banned member", { ...member, banned: true }, reply],
    ["a moderator of this category", moderatorOf("2"), reply],
  ])("leaves it out for %s", async (_, me, frame) => {
    session(me);
    render(<FrameToolbar frame={frame} thread={thread} />);
    await settle();
    expect(screen.queryByRole("button", { name: /^Report/ })).toBeNull();
  });

  it("shows it to a moderator of another category", async () => {
    session(moderatorOf("4"));
    render(<FrameToolbar frame={opening} thread={thread} />);
    expect(await screen.findByRole("button", { name: "Report thread" })).toBeInTheDocument();
  });

  it("sends a report with a reason and details, then reads Reported", async () => {
    session(member);
    reports.reportContent.mockResolvedValue({ ok: true, message: "Report sent. Thank you." });
    const user = userEvent.setup();
    render(
      <>
        <FrameToolbar frame={reply} thread={thread} />
        <Toaster />
      </>,
    );
    const button = await screen.findByRole("button", { name: "Report" });
    await user.click(button);
    const dialog = screen.getByRole("dialog", { name: "Report FRAME 03" });
    expect(within(dialog).getByRole("radio", { name: "Spam or advertising" })).toHaveFocus();
    await user.click(within(dialog).getByRole("radio", { name: "Harassment or abuse" }));
    await user.type(within(dialog).getByLabelText(/Details/), "Insults");
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(reports.reportContent).toHaveBeenCalledWith({
      target: { kind: "reply", id: "7" },
      reason: "abuse",
      details: "Insults",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Report sent. Thank you.")).toBeInTheDocument();
    expect(button).toHaveTextContent("Reported");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when this member already reported it", async () => {
    session(member);
    reports.reportContent.mockResolvedValue({
      ok: false,
      error: "You already reported this. Staff will review it.",
      already: true,
    });
    const user = userEvent.setup();
    render(<FrameToolbar frame={opening} thread={thread} />);
    await user.click(await screen.findByRole("button", { name: "Report thread" }));
    const dialog = screen.getByRole("dialog", { name: "Report thread" });
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already reported");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Reported" })).toBeInTheDocument();
  });

  it("keeps the dialog open on an error, and shows a generic one when the action throws", async () => {
    session(member);
    reports.reportContent
      .mockResolvedValueOnce({ ok: false, error: "Tell us what's wrong." })
      .mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<FrameToolbar frame={reply} thread={thread} />);
    await user.click(await screen.findByRole("button", { name: "Report" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Something else" }));
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Tell us what's wrong.");
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });
});

describe("ProfileReport", () => {
  it("offers Report profile to members on someone else's profile", async () => {
    session(member);
    reports.reportContent.mockResolvedValue({ ok: true, message: "Report sent. Thank you." });
    const user = userEvent.setup();
    render(<ProfileReport handle="bob" />);
    await user.click(await screen.findByRole("button", { name: "Report profile" }));
    const dialog = screen.getByRole("dialog", { name: "Report bob" });
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));
    expect(reports.reportContent).toHaveBeenCalledWith({
      target: { kind: "profile", handle: "bob" },
      reason: "spam",
      details: "",
    });
  });

  it.each([
    ["a guest", null],
    ["the member themselves", { ...member, handle: "Bob" }],
    ["a superuser", superuser],
    ["an unfinished sign-up", { ...member, handle: null, onboarded: false }],
  ])("renders nothing for %s", async (_, me) => {
    session(me);
    const { container } = render(<ProfileReport handle="bob" />);
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});

const at = new Date("2026-10-13T09:30:00Z");
const groups: ReportGroup[] = [
  {
    key: "reply:7",
    target: {
      kind: "reply",
      replyId: "7",
      threadId: "42",
      categorySlug: "games",
      threadTitle: "Saltbound",
      hidden: false,
      threadHidden: false,
      authorHandle: "bob",
      excerpt: "Buy <b>now</b>",
    },
    reports: [
      { id: "3", reason: "Spam or advertising", createdAt: at, reporterHandle: "ada" },
      { id: "5", reason: "Something else: odd", createdAt: at, reporterHandle: null },
    ],
  },
  {
    key: "thread:9",
    target: {
      kind: "thread",
      threadId: "9",
      categorySlug: "games",
      threadTitle: "Hidden one",
      hidden: true,
      threadHidden: true,
      authorHandle: null,
      excerpt: "",
    },
    reports: [{ id: "4", reason: "Harassment or abuse", createdAt: at, reporterHandle: "ada" }],
  },
  {
    key: "profile:bob",
    target: { kind: "profile", handle: "bob", banned: true },
    reports: [{ id: "6", reason: "Harassment or abuse", createdAt: at, reporterHandle: "cy" }],
  },
];
const resolved: ResolvedReport[] = [
  {
    id: "2",
    reason: "Spam or advertising",
    createdAt: at,
    reporterHandle: "ada",
    status: "actioned",
    resolvedAt: at,
    resolverHandle: "root",
    target: { ...groups[0]!.target },
  },
  {
    id: "1",
    reason: "Other",
    createdAt: at,
    reporterHandle: null,
    status: "dismissed",
    resolvedAt: null,
    resolverHandle: null,
    target: null,
  },
];

describe("ReportQueue", () => {
  it("lists each target with a link, its reports and the actions", () => {
    render(<ReportQueue groups={groups} total={4} resolved={resolved} />);
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    const [replyCard, threadCard, profileCard] = cards as [HTMLElement, HTMLElement, HTMLElement];
    expect(
      within(replyCard).getByRole("link", { name: "Reply in \u201cSaltbound\u201d" }),
    ).toHaveAttribute("href", "/forum/games/42#reply-7");
    // stored Markdown is shown as plain text
    expect(within(replyCard).getByText("Buy <b>now</b>")).toBeInTheDocument();
    expect(within(replyCard).getByText("2 reports")).toBeInTheDocument();
    expect(within(replyCard).getByText(/#5 by/)).toHaveTextContent("#5 by [deleted]");
    expect(
      within(replyCard).getByRole("group", { name: "Act on Reply in \u201cSaltbound\u201d" }),
    ).toBeInTheDocument();
    expect(within(replyCard).getByRole("button", { name: "Hide reply" })).toBeInTheDocument();

    expect(within(threadCard).getByText("Hidden")).toBeInTheDocument();
    expect(within(threadCard).queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(within(threadCard).getByText(/By/)).toHaveTextContent("By [deleted]");

    expect(within(profileCard).getByRole("link", { name: "@bob" })).toHaveAttribute(
      "href",
      "/u/bob",
    );
    expect(within(profileCard).getByRole("link", { name: "Member page" })).toHaveAttribute(
      "href",
      "/admin/members/bob",
    );
    expect(within(profileCard).getByText("Banned")).toBeInTheDocument();
    expect(screen.getByText("4 reports")).toBeInTheDocument();
  });

  it("notes when only the oldest reports are listed, and lists resolved ones", () => {
    render(<ReportQueue groups={groups} total={250} resolved={resolved} />);
    expect(screen.getByText("Oldest 4 of 250")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Actioned")).toBeInTheDocument();
    expect(within(table).getByText("Dismissed")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "@root" })).toBeInTheDocument();
  });

  it("says when the queue and the resolved list are empty", () => {
    render(<ReportQueue groups={[]} total={0} resolved={[]} />);
    expect(screen.getByText("No open reports.")).toBeInTheDocument();
    expect(screen.getByText("Nothing resolved yet.")).toBeInTheDocument();
    expect(screen.getByText("0 reports")).toBeInTheDocument();
  });

  it("resolves a target's reports and hides a post", async () => {
    reports.resolveReports.mockResolvedValue({ ok: true, message: "2 reports dismissed" });
    moderation.hidePost.mockResolvedValue({ ok: true, message: "Reply hidden" });
    const user = userEvent.setup();
    render(
      <>
        <ReportQueue groups={groups.slice(0, 1)} total={2} resolved={[]} />
        <Toaster />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(reports.resolveReports).toHaveBeenCalledWith({ ids: ["3", "5"], status: "dismissed" });
    expect(await screen.findByText("2 reports dismissed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark actioned" }));
    expect(reports.resolveReports).toHaveBeenLastCalledWith({
      ids: ["3", "5"],
      status: "actioned",
    });
    await user.click(screen.getByRole("button", { name: "Hide reply" }));
    expect(moderation.hidePost).toHaveBeenCalledWith({
      kind: "reply",
      id: "7",
      note: "reports #3, #5",
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("offers Hide thread on a visible reported thread and toasts errors", async () => {
    moderation.hidePost.mockResolvedValue({ ok: false, error: "You can't moderate this post." });
    const user = userEvent.setup();
    const visible = {
      ...groups[1]!,
      target: { ...groups[1]!.target, hidden: false, threadHidden: false },
    };
    render(
      <>
        <ReportQueue groups={[visible as ReportGroup]} total={1} resolved={[]} />
        <Toaster />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Hide thread" }));
    expect(moderation.hidePost).toHaveBeenCalledWith({
      kind: "thread",
      id: "9",
      note: "report #4",
    });
    expect(await screen.findByText("You can't moderate this post.")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

const log = (over: Partial<LogPage> = {}): LogPage => ({
  items: [
    {
      id: "3",
      action: "hide",
      note: "Spam",
      createdAt: at,
      actorHandle: "root",
      target: { ...groups[1]!.target },
    },
    {
      id: "2",
      action: "ban",
      note: null,
      createdAt: at,
      actorHandle: null,
      target: { kind: "profile", handle: "bob", banned: true },
    },
    {
      id: "1",
      action: "category_create",
      note: "games",
      createdAt: at,
      actorHandle: "root",
      target: null,
    },
  ],
  total: 3,
  page: 1,
  pages: 1,
  ...over,
});

describe("ModerationLog", () => {
  it("lists entries with actor, action, target link and note", () => {
    render(<ModerationLog log={log()} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[2]!.textContent)).toEqual([
      "Hide",
      "Ban",
      "Create category",
    ]);
    expect(within(rows[0]!).getByRole("link", { name: "Hidden one" })).toHaveAttribute(
      "href",
      "/forum/games/9",
    );
    expect(within(rows[1]!).getByRole("link", { name: "@bob" })).toHaveAttribute(
      "href",
      "/admin/members/bob",
    );
    expect(within(rows[1]!).getByText("[deleted]")).toBeInTheDocument();
    expect(screen.getByText("3 entries, newest first")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("unhides a thread that is still hidden from its hide row", async () => {
    moderation.unhidePost.mockResolvedValue({ ok: true, message: "Thread visible again" });
    const user = userEvent.setup();
    render(
      <>
        <ModerationLog log={log()} />
        <Toaster />
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Unhide thread \u201cHidden one\u201d" }));
    expect(moderation.unhidePost).toHaveBeenCalledWith({ kind: "thread", id: "9" });
    expect(await screen.findByText("Thread visible again")).toBeInTheDocument();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("pages through older entries", () => {
    const { unmount } = render(<ModerationLog log={log({ total: 120, page: 2, pages: 3 })} />);
    const pager = screen.getByRole("navigation", { name: "Log pages" });
    expect(within(pager).getByRole("link", { name: "Newer" })).toHaveAttribute(
      "href",
      "/admin/log",
    );
    expect(within(pager).getByRole("link", { name: "Older" })).toHaveAttribute(
      "href",
      "/admin/log?page=3",
    );
    unmount();
    render(<ModerationLog log={log({ items: [], total: 120, page: 9, pages: 3 })} />);
    expect(screen.getByText("No entries on this page.")).toBeInTheDocument();
  });

  it("says when nothing is logged", () => {
    render(<ModerationLog log={log({ items: [], total: 0 })} />);
    expect(screen.getByText("Nothing logged yet.")).toBeInTheDocument();
  });
});
