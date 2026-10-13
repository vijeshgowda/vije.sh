import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryFormState, CategoryRowState } from "../actions";
import type { AdminCategory } from "../queries";

const actions = vi.hoisted(() => ({
  createCategoryAction: vi.fn(
    async (_p: CategoryFormState, _f: FormData): Promise<CategoryFormState> => ({}),
  ),
  updateCategoryAction: vi.fn(
    async (_p: CategoryFormState, _f: FormData): Promise<CategoryFormState> => ({}),
  ),
  moveCategoryAction: vi.fn(
    async (_p: CategoryRowState, _f: FormData): Promise<CategoryRowState> => ({}),
  ),
  setStaffOnlyAction: vi.fn(
    async (_p: CategoryRowState, _f: FormData): Promise<CategoryRowState> => ({}),
  ),
  deleteCategoryAction: vi.fn(
    async (_p: CategoryRowState, _f: FormData): Promise<CategoryRowState> => ({}),
  ),
}));
vi.mock("../actions", () => actions);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/layout/toast", () => ({ toast }));

const { CategoryTable } = await import("./CategoryTable");
const { CategoryCreateForm } = await import("./CategoryCreateForm");

const lastForm = (fn: { mock: { calls: unknown[][] } }) =>
  Object.fromEntries((fn.mock.calls.at(-1)![1] as FormData).entries());

// one input event per call instead of one per key: keystroke typing times out on a busy machine
async function typeIn(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

const cat = (over: Partial<AdminCategory>): AdminCategory => ({
  id: "1",
  slug: "games",
  name: "Games",
  description: null,
  staffOnly: false,
  threadCount: 0,
  moderatorCount: 0,
  ...over,
});
const CATS = [
  cat({ id: "1", slug: "announcements", name: "Announcements", staffOnly: true, threadCount: 3 }),
  cat({ id: "2", slug: "games", name: "Games", description: "Play", moderatorCount: 2 }),
  cat({ id: "3", slug: "hardware", name: "Hardware", moderatorCount: 1 }),
];

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

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

describe("CategoryTable", () => {
  it("lists categories in order with their URL, threads and posting rule", () => {
    render(<CategoryTable categories={CATS} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("01");
    expect(within(rows[0]!).getByRole("link", { name: "/forum/announcements" })).toHaveAttribute(
      "href",
      "/forum/announcements",
    );
    expect(rows[0]).toHaveTextContent("Staff only");
    expect(within(rows[0]!).getByRole("button", { name: "Staff only" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rows[1]).toHaveTextContent("Play");
    expect(rows[1]).toHaveTextContent("Everyone");
    expect(within(rows[1]!).getByRole("button", { name: "Staff only" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // the ends can't move further
    expect(within(rows[0]!).getByRole("button", { name: "Up" })).toBeDisabled();
    expect(within(rows[2]!).getByRole("button", { name: "Down" })).toBeDisabled();
    // each control says which category it acts on
    expect(within(rows[1]!).getByRole("button", { name: "Edit" })).toHaveAccessibleDescription(
      "Games",
    );
  });

  it("says when there are no categories", () => {
    render(<CategoryTable categories={[]} />);
    expect(screen.getByText(/No categories yet/)).toBeInTheDocument();
  });

  it("moves a category and announces it", async () => {
    actions.moveCategoryAction.mockResolvedValueOnce({ message: "Moved up." });
    const user = userEvent.setup();
    const { rerender } = render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Hardware")).getByRole("button", { name: "Up" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Moved up."));
    expect(lastForm(actions.moveCategoryAction)).toEqual({ id: "3", direction: "up" });
    // the refreshed order keeps focus on the arrow that was pressed
    rerender(<CategoryTable categories={[CATS[0]!, CATS[2]!, CATS[1]!]} />);
    expect(within(row("Hardware")).getByRole("button", { name: "Up" })).toHaveFocus();
  });

  it("moves focus to the other arrow once a row reaches the end", async () => {
    actions.moveCategoryAction.mockResolvedValueOnce({ message: "Moved up." });
    const user = userEvent.setup();
    const { rerender } = render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Games")).getByRole("button", { name: "Up" }));
    await waitFor(() => expect(actions.moveCategoryAction).toHaveBeenCalled());
    rerender(<CategoryTable categories={[CATS[1]!, CATS[0]!, CATS[2]!]} />);
    expect(within(row("Games")).getByRole("button", { name: "Down" })).toHaveFocus();
  });

  it("toggles staff-only posting and shows errors in the row", async () => {
    actions.setStaffOnlyAction.mockResolvedValueOnce({
      error: "This category no longer exists.",
    });
    const user = userEvent.setup();
    render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Games")).getByRole("button", { name: "Staff only" }));
    expect(await within(row("Games")).findByRole("alert")).toHaveTextContent(
      "This category no longer exists.",
    );
    expect(lastForm(actions.setStaffOnlyAction)).toEqual({ id: "2", staffOnly: "true" });
    expect(toast).not.toHaveBeenCalled();
  });

  it("renames in a dialog, keeps the slug and closes on success", async () => {
    actions.updateCategoryAction
      .mockResolvedValueOnce({ field: "name", error: "Name is required." })
      .mockResolvedValueOnce({ message: "Saved Gaming." });
    const user = userEvent.setup();
    render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Games")).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Games" });
    const d = within(dialog);
    expect(d.getByLabelText("Description")).toHaveValue("Play");
    expect(d.getByText(/The slug \/forum\/games stays/)).toBeInTheDocument();
    const name = d.getByLabelText("Name");
    await user.clear(name);
    // blank but present, so only the server refuses it
    await typeIn(user, name, " ");
    await user.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText("Name is required.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(dialog).toHaveAttribute("open");

    await user.clear(name);
    await typeIn(user, name, "Gaming");
    await user.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(lastForm(actions.updateCategoryAction)).toEqual({
      id: "2",
      name: "Gaming",
      description: "Play",
    });
    expect(toast).toHaveBeenCalledWith("Saved Gaming.");
  });

  it("cancels an edit and starts from the saved details next time", async () => {
    const user = userEvent.setup();
    render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Games")).getByRole("button", { name: "Edit" }));
    const d = within(screen.getByRole("dialog", { name: "Edit Games" }));
    await typeIn(user, d.getByLabelText("Name"), " typo");
    await user.click(d.getByRole("button", { name: "Cancel" }));
    await user.click(within(row("Games")).getByRole("button", { name: "Edit" }));
    expect(d.getByLabelText("Name")).toHaveValue("Games");
    expect(actions.updateCategoryAction).not.toHaveBeenCalled();
  });

  it("deletes an empty category only after confirming", async () => {
    actions.deleteCategoryAction
      .mockResolvedValueOnce({
        error: "This category still has threads. Only empty categories can be deleted.",
      })
      .mockResolvedValueOnce({ message: "Category deleted." });
    const user = userEvent.setup();
    render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Hardware")).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Hardware?" });
    const d = within(dialog);
    expect(dialog).toHaveTextContent(
      "/forum/hardware and its 1 category moderator grant will be removed for good.",
    );
    await user.click(d.getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(actions.deleteCategoryAction).not.toHaveBeenCalled();

    // the server still refuses if a thread arrived meanwhile
    await user.click(within(row("Hardware")).getByRole("button", { name: "Delete" }));
    await user.click(d.getByRole("button", { name: "Delete category" }));
    expect(await d.findByRole("alert")).toHaveTextContent("still has threads");
    expect(lastForm(actions.deleteCategoryAction)).toEqual({ id: "3" });

    await user.click(d.getByRole("button", { name: "Delete category" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Category deleted."));
  });

  it("explains why a category with threads can't be deleted", async () => {
    const user = userEvent.setup();
    render(<CategoryTable categories={CATS} />);
    await user.click(within(row("Announcements")).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Announcements can't be deleted" });
    expect(dialog).toHaveTextContent("It has 3 threads, hidden ones included.");
    expect(within(dialog).queryByRole("button", { name: "Delete category" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("words a single thread and several grants", async () => {
    const user = userEvent.setup();
    render(
      <CategoryTable
        categories={[
          cat({ threadCount: 1 }),
          cat({ id: "4", slug: "x", name: "X", moderatorCount: 2 }),
        ]}
      />,
    );
    await user.click(within(row("Games")).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Games can't be deleted" })).toHaveTextContent(
      "It has 1 thread,",
    );
    await user.click(within(row("X")).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete X?" })).toHaveTextContent(
      "its 2 category moderator grants",
    );
  });
});

describe("CategoryCreateForm", () => {
  it("suggests a slug from the name until the slug is edited, then creates", async () => {
    actions.createCategoryAction.mockResolvedValueOnce({ message: "Created Local AI." });
    const user = userEvent.setup();
    render(<CategoryCreateForm />);
    await typeIn(user, screen.getByLabelText("Name"), "Local AI");
    const slug = screen.getByLabelText("Slug");
    expect(slug).toHaveValue("local-ai");
    expect(screen.getByText(/The URL is \/forum\/local-ai;/)).toBeInTheDocument();
    await user.clear(slug);
    await typeIn(user, slug, "ai");
    await typeIn(user, screen.getByLabelText("Name"), "!");
    expect(slug).toHaveValue("ai");
    await typeIn(user, screen.getByLabelText("Description"), "Models");
    await user.click(screen.getByLabelText(/Staff only/));
    await user.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText("Created Local AI.")).toBeInTheDocument();
    expect(lastForm(actions.createCategoryAction)).toEqual({
      name: "Local AI!",
      slug: "ai",
      description: "Models",
      staffOnly: "on",
    });
    // a fresh form for the next one
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Slug")).toHaveValue("");
    expect(screen.getByLabelText(/Staff only/)).not.toBeChecked();
  });

  it("marks the invalid field and keeps what was typed", async () => {
    actions.createCategoryAction.mockResolvedValueOnce({
      field: "slug",
      error: "Slug is already used by another category.",
    });
    const user = userEvent.setup();
    render(<CategoryCreateForm />);
    await typeIn(user, screen.getByLabelText("Name"), "Games");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    expect(
      await screen.findByText("Slug is already used by another category."),
    ).toBeInTheDocument();
    const slug = screen.getByLabelText("Slug");
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAttribute("aria-describedby", "category-slug-hint category-error");
    expect(slug).toHaveValue("games");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-describedby");
  });
});
