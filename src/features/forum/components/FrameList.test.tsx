import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThreadDetail } from "../types";
import { FrameList, type RenderedFrame } from "./FrameList";
import { ThreadIntro } from "./ThreadIntro";

const at = new Date("2026-10-05T12:30:00Z");

const frame = (over: Partial<RenderedFrame> = {}): RenderedFrame => ({
  key: "thread-42",
  kind: "thread",
  id: "42",
  no: 0,
  createdAt: at,
  editedAt: null,
  hidden: false,
  author: { handle: "vijesh", role: "admin" },
  bodyMd: "Hello",
  body: <p>Hello</p>,
  ...over,
});

const frames: RenderedFrame[] = [
  frame(),
  frame({
    key: "reply-7",
    kind: "reply",
    id: "7",
    no: 1,
    author: { handle: "mod", role: "moderator" },
    editedAt: new Date("2026-10-05T12:40:00Z"),
    body: <p>Edited reply</p>,
  }),
  frame({
    key: "reply-8",
    kind: "reply",
    id: "8",
    no: 2,
    hidden: true,
    author: null,
    bodyMd: null,
    body: null,
  }),
  frame({
    key: "reply-9",
    kind: "reply",
    id: "9",
    no: 3,
    author: { handle: "ada", role: "member" },
    body: <p>Member reply</p>,
  }),
  frame({ key: "reply-10", kind: "reply", id: "10", no: 4, author: null, body: <p>Orphan</p> }),
];

describe("FrameList", () => {
  it("renders FRAME nn, author, role pill, time and body", () => {
    render(<FrameList frames={frames} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);

    const op = items[0]!;
    expect(op).toHaveAttribute("id", "thread-42");
    expect(op).toHaveTextContent("FRAME 00");
    expect(within(op).getByRole("link", { name: "vijesh" })).toHaveAttribute("href", "/u/vijesh");
    expect(within(op).getByText("Owner")).toHaveAttribute("data-role", "admin");
    expect(within(op).getByText("5 Oct 2026, 12:30 UTC")).toHaveAttribute(
      "datetime",
      "2026-10-05T12:30:00.000Z",
    );
    expect(op).toHaveTextContent("Hello");
    expect(op).not.toHaveTextContent("edited");

    const edited = items[1]!;
    expect(edited).toHaveTextContent("FRAME 01");
    expect(within(edited).getByText("Moderator")).toHaveAttribute("data-role", "moderator");
    expect(within(edited).getByTitle("Edited 5 Oct 2026, 12:40 UTC")).toHaveTextContent("edited");

    expect(within(items[3]!).getByText("Member")).toHaveAttribute("data-role", "member");
  });

  it("shows superusers with their own pill", () => {
    render(<FrameList frames={[frame({ author: { handle: "su", role: "superuser" } })]} />);
    expect(screen.getByText("Superuser")).toHaveAttribute("data-role", "superuser");
  });

  it("shows a placeholder for hidden replies, without author or body", () => {
    render(<FrameList frames={frames} />);
    const hidden = screen.getAllByRole("listitem")[2]!;
    expect(hidden).toHaveAttribute("id", "reply-8");
    expect(hidden).toHaveTextContent("FRAME 02");
    expect(hidden).toHaveTextContent("This reply was hidden by a moderator.");
    expect(within(hidden).queryByText(/Owner|Superuser|Moderator|Member/)).toBeNull();
  });

  it("names deleted accounts without a role pill", () => {
    render(<FrameList frames={frames} />);
    const orphan = screen.getAllByRole("listitem")[4]!;
    expect(within(orphan).getByText("[deleted]")).toBeInTheDocument();
    expect(within(orphan).queryByText(/Owner|Superuser|Moderator|Member/)).toBeNull();
  });

  it("renders per-frame actions from the extension slot", () => {
    render(
      <FrameList
        frames={frames}
        renderActions={(f) =>
          f.hidden ? null : <button type="button">{`Report ${f.key}`}</button>
        }
      />,
    );
    expect(screen.getByRole("button", { name: "Report thread-42" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report reply-9" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report reply-8" })).toBeNull();
  });
});

describe("ThreadIntro", () => {
  const thread: ThreadDetail = {
    id: "42",
    title: "Pooling with pg",
    category: {
      id: "2",
      slug: "engineering",
      name: "Engineering",
      description: null,
      staffOnly: false,
    },
    createdAt: at,
    pinned: true,
    locked: true,
    frames: [frame()],
  };

  it("links back to the category and shows the frame count and badges", () => {
    render(<ThreadIntro thread={thread} />);
    expect(screen.getByRole("link", { name: "← Engineering" })).toHaveAttribute(
      "href",
      "/forum/engineering",
    );
    expect(screen.getByText(/Engineering · 1 frame/)).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Pooling with pg" })).toBeInTheDocument();
  });
});
