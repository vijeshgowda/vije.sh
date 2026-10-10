import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/layout/Toaster";
import { landed, useLaunching } from "@/features/launch/launch";
import { pins } from "@/features/live/client/prefs";
import { setPaletteOpen } from "../palette";
import { Palette } from "./Palette";
import { PaletteButton } from "./PaletteButton";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const notes = [
  {
    id: "AN-001",
    slug: "planning",
    title: "Planning this site",
    category: "Web",
    date: "2026-10-01",
  },
];

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

beforeEach(() => {
  push.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  act(() => setPaletteOpen(false));
});

function Flying() {
  return <p>{useLaunching() ? "flying" : "grounded"}</p>;
}

function setup() {
  const user = userEvent.setup();
  render(
    <>
      <main id="main" tabIndex={-1} />
      <PaletteButton variant="header" />
      <PaletteButton variant="footer" />
      <Palette notes={notes} />
      <Toaster />
      <Flying />
    </>,
  );
  return user;
}

const box = () => screen.getByRole("combobox");
const dialog = () => document.querySelector("dialog")!;

describe("<Palette>", () => {
  it("opens from either button and toggles with Ctrl K", async () => {
    const user = setup();
    expect(dialog()).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Jump to: search (Ctrl K)" }));
    expect(dialog()).toHaveAttribute("open");
    expect(box()).toHaveFocus();
    await user.keyboard("{Control>}k{/Control}");
    expect(dialog()).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Search Ctrl K" }));
    expect(dialog()).toHaveAttribute("open");
    await user.keyboard("{Meta>}K{/Meta}");
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("filters as you type and moves the selection with the arrow keys", async () => {
    const user = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(box(), "planning");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Planning this site");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(box()).toHaveAttribute("aria-activedescendant", "pal-o0");

    await user.clear(box());
    await user.type(box(), "section");
    const n = screen.getAllByRole("option").length;
    await user.keyboard("{ArrowUp}");
    expect(box()).toHaveAttribute("aria-activedescendant", `pal-o${n - 1}`);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(box()).toHaveAttribute("aria-activedescendant", "pal-o1");

    await user.clear(box());
    await user.type(box(), "qqqq");
    expect(screen.getByRole("option")).toHaveTextContent("Nothing matches");
    expect(box()).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(dialog()).toHaveAttribute("open");
  });

  it("opens the chosen page and closes", async () => {
    const user = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(box(), "note planning{Enter}");
    expect(push).toHaveBeenCalledWith("/blog/planning");
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("runs commands: theme, launch, reset feeds, copy link, back to top", async () => {
    const user = setup();
    const command = async (q: string) => {
      act(() => setPaletteOpen(true));
      await user.type(box(), q);
      await user.click(screen.getAllByRole("option")[0]!);
    };

    await command("dark mode");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await command("light mode");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await command("launch the rocket");
    expect(screen.getByText("flying")).toBeInTheDocument();
    act(() => landed());

    pins.set(["hn"]);
    await command("reset overview");
    expect(pins.get()).toEqual(["iss", "man", "hn"]);
    expect(screen.getByRole("status")).toHaveTextContent("Overview feeds reset");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await command("copy a link");
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Link copied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    await command("copy a link");
    expect(screen.getByRole("status")).toHaveTextContent("Could not copy the link");

    await command("back to top");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(document.getElementById("main")).toHaveFocus();
  });

  it("closes on a backdrop click and when the dialog closes itself (Esc)", async () => {
    const user = setup();
    act(() => setPaletteOpen(true));
    await user.click(dialog());
    expect(dialog()).not.toHaveAttribute("open");
    act(() => setPaletteOpen(true));
    act(() => dialog().close());
    act(() => setPaletteOpen(true));
    expect(dialog()).toHaveAttribute("open");
    // after reopening, the query starts empty again
    expect(box()).toHaveValue("");
  });

  it("highlights options under the pointer", async () => {
    const user = setup();
    act(() => setPaletteOpen(true));
    const second = screen.getAllByRole("option")[1]!;
    fireEvent.pointerMove(second);
    expect(second).toHaveAttribute("aria-selected", "true");
    await user.click(second);
    expect(push).toHaveBeenCalledWith("/work");
  });
});
