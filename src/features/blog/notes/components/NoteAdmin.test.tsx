import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteFormState, NotePreviewState, NoteStatusState } from "../actions";

const actions = vi.hoisted(() => ({
  createNoteAction: vi.fn(async (_p: NoteFormState, _f: FormData): Promise<NoteFormState> => ({})),
  updateNoteAction: vi.fn(async (_p: NoteFormState, _f: FormData): Promise<NoteFormState> => ({})),
  previewNoteAction: vi.fn(
    async (_p: NotePreviewState, _f: FormData): Promise<NotePreviewState> => ({}),
  ),
  publishNoteAction: vi.fn(
    async (_p: NoteStatusState, _f: FormData): Promise<NoteStatusState> => ({}),
  ),
  unpublishNoteAction: vi.fn(
    async (_p: NoteStatusState, _f: FormData): Promise<NoteStatusState> => ({}),
  ),
  deleteNoteAction: vi.fn(
    async (_p: NoteStatusState, _f: FormData): Promise<NoteStatusState> => ({}),
  ),
}));
vi.mock("../actions", () => actions);
// the table formats dates with the zone from queries.ts, which would load the database module
vi.mock("../queries", () => ({ NOTE_TIME_ZONE: "Europe/London" }));

const { NoteEditor } = await import("./NoteEditor");
const { NoteControls } = await import("./NoteControls");
const { NoteTable } = await import("./NoteTable");

// one input event per call instead of one per key: keystroke typing times out on a busy machine
async function typeIn(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

const NOTE = {
  id: "7",
  slug: "a-note",
  title: "A note",
  summary: null,
  bodyMd: "Saved body",
  tags: ["one", "two"],
  visibility: "unlisted" as const,
};

const lastForm = (fn: { mock: { calls: unknown[][] } }) =>
  Object.fromEntries((fn.mock.calls.at(-1)![1] as FormData).entries());

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has <dialog> but not the modal methods
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

describe("NoteEditor", () => {
  it("suggests a slug from the title until the slug is edited, and creates a draft", async () => {
    const user = userEvent.setup();
    render(<NoteEditor />);
    await typeIn(user, screen.getByLabelText("Title"), "Hello, World!");
    const slug = screen.getByLabelText("Slug");
    expect(slug).toHaveValue("hello-world");
    expect(screen.getByText(/The URL: \/blog\/hello-world\./)).toBeInTheDocument();
    await user.clear(slug);
    await typeIn(user, slug, "custom");
    await typeIn(user, screen.getByLabelText("Title"), " again");
    expect(slug).toHaveValue("custom");
    await typeIn(user, screen.getByLabelText("Summary"), "Short");
    await typeIn(user, screen.getByLabelText("Tags"), "a, b");
    await user.selectOptions(screen.getByLabelText("Visibility"), "private");
    await typeIn(user, screen.getByLabelText("Body (Markdown)"), "Hi");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(actions.createNoteAction).toHaveBeenCalled());
    expect(lastForm(actions.createNoteAction)).toEqual({
      title: "Hello, World! again",
      slug: "custom",
      summary: "Short",
      tags: "a, b",
      visibility: "private",
      bodyMd: "Hi",
    });
    expect(screen.getByText("Press Preview to render the body.")).toBeInTheDocument();
  });

  it("marks the invalid field and keeps what was typed", async () => {
    actions.createNoteAction.mockResolvedValueOnce({ field: "slug", error: "Slug is taken." });
    const user = userEvent.setup();
    render(<NoteEditor />);
    await typeIn(user, screen.getByLabelText("Title"), "Taken");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("Slug is taken.")).toBeInTheDocument();
    const slug = screen.getByLabelText("Slug");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAttribute("aria-describedby", "note-slug-hint note-error");
    expect(slug).toHaveValue("taken");
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-describedby");
  });

  it("edits a note in place, then previews the unsaved body", async () => {
    actions.updateNoteAction.mockResolvedValueOnce({ message: "Saved." });
    actions.previewNoteAction.mockImplementationOnce(async (_p, f) => ({
      source: String(f.get("bodyMd")),
      body: <p>Rendered preview</p>,
    }));
    const user = userEvent.setup();
    render(<NoteEditor note={NOTE} savedPreview={<p>Saved rendering</p>} />);
    expect(screen.getByLabelText("Tags")).toHaveValue("one, two");
    expect(screen.getByLabelText("Visibility")).toHaveValue("unlisted");
    expect(screen.getByLabelText("Summary")).toHaveValue("");
    const preview = screen.getByTestId("note-preview");
    expect(preview).toHaveTextContent("Saved rendering");
    expect(screen.getByText(/Saved version/)).toBeInTheDocument();

    // the slug no longer follows the title once a note exists
    await typeIn(user, screen.getByLabelText("Title"), "!");
    expect(screen.getByLabelText("Slug")).toHaveValue("a-note");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(lastForm(actions.updateNoteAction)).toMatchObject({ id: "7", title: "A note!" });

    const body = screen.getByLabelText("Body (Markdown)");
    await typeIn(user, body, " more");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(preview).toHaveTextContent("Rendered preview"));
    expect(lastForm(actions.previewNoteAction)).toMatchObject({ bodyMd: "Saved body more" });
    expect(screen.getByText(/Unsaved text/)).toBeInTheDocument();

    // typing again makes the preview stale: back to the saved rendering
    await typeIn(user, body, "!");
    expect(preview).toHaveTextContent("Saved rendering");
  });

  it("shows a preview error", async () => {
    actions.previewNoteAction.mockResolvedValueOnce({ error: "Body is too long." });
    const user = userEvent.setup();
    render(<NoteEditor />);
    // browsers skip the required-field checks (jsdom ignores formnovalidate)
    const button = screen.getByRole("button", { name: "Preview" });
    expect(button).toHaveAttribute("formnovalidate");
    await typeIn(user, screen.getByLabelText("Title"), "T");
    await user.click(button);
    expect(await screen.findByText("Body is too long.")).toBeInTheDocument();
  });
});

describe("NoteControls", () => {
  it("publishes a draft", async () => {
    actions.publishNoteAction.mockResolvedValueOnce({ message: "Published." });
    const user = userEvent.setup();
    render(<NoteControls id="7" title="A note" slug="a-note" status="draft" visibility="public" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Published.")).toBeInTheDocument();
    expect(lastForm(actions.publishNoteAction)).toEqual({ id: "7" });
  });

  it("unpublishes a published note, links to it and shows errors", async () => {
    actions.unpublishNoteAction.mockResolvedValueOnce({ error: "This note no longer exists." });
    const user = userEvent.setup();
    render(
      <NoteControls id="7" title="A note" slug="a-note" status="published" visibility="public" />,
    );
    expect(screen.getByRole("link", { name: "View /blog/a-note" })).toHaveAttribute(
      "href",
      "/blog/a-note",
    );
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This note no longer exists.");
  });

  it("doesn't link to a private note", () => {
    render(
      <NoteControls id="7" title="A note" slug="a-note" status="published" visibility="private" />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("deletes only after confirming in the dialog", async () => {
    const user = userEvent.setup();
    render(
      <NoteControls id="7" title="A note" slug="a-note" status="published" visibility="public" />,
    );
    const dialog = document.querySelector("dialog")!;
    expect(dialog).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(dialog).toHaveAttribute("open");
    const d = within(dialog);
    expect(d.getByText(/disappear from \/blog/)).toBeInTheDocument();
    await user.click(d.getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(actions.deleteNoteAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(d.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(actions.deleteNoteAction).toHaveBeenCalled());
    expect(lastForm(actions.deleteNoteAction)).toEqual({ id: "7" });
  });
});

describe("NoteTable", () => {
  it("lists drafts and published notes with their status", () => {
    render(
      <NoteTable
        notes={[
          {
            id: "2",
            slug: "live",
            title: "Live note",
            status: "published",
            visibility: "public",
            published_at: new Date("2026-10-01T09:30:00Z"),
            updated_at: new Date("2026-10-02T09:30:00Z"),
          },
          {
            id: "1",
            slug: "draft",
            title: "Draft note",
            status: "draft",
            visibility: "private",
            published_at: null,
            updated_at: new Date("2026-09-01T09:30:00Z"),
          },
        ]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("link", { name: "Live note" })).toHaveAttribute(
      "href",
      "/admin/notes/2",
    );
    expect(rows[0]).toHaveTextContent("Published");
    expect(rows[0]).toHaveTextContent("1 Oct 2026, 10:30");
    expect(rows[1]).toHaveTextContent("Draft");
    expect(rows[1]).toHaveTextContent("/blog/draft");
    expect(within(rows[1]!).getByText("—")).toBeInTheDocument();
  });

  it("says when there are no notes", () => {
    render(<NoteTable notes={[]} />);
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
  });
});
