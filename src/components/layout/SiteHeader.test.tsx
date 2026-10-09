import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/live" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const { SiteHeader } = await import("./SiteHeader");

function setNavOverflow(over: boolean) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => (over ? 900 : 100),
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 300,
  });
}

beforeEach(() => {
  nav.pathname = "/live";
  setNavOverflow(false);
});

describe("SiteHeader", () => {
  it("marks the current page and lists all seven", () => {
    render(<SiteHeader />);
    const links = screen.getAllByRole("link").filter((a) => a.closest("nav"));
    expect(links).toHaveLength(7);
    expect(screen.getByRole("link", { name: /P7\s*Live/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("banner")).toHaveAttribute("data-fit", "full");
  });

  it("switches to the menu button when links overflow, and the menu opens and closes", async () => {
    setNavOverflow(true);
    const user = userEvent.setup();
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-fit", "compact");
    const btn = screen.getByRole("button", { name: "Menu, current page: Live" });
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveFocus();
    await user.click(btn);
    await user.click(document.body);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu after navigating", async () => {
    setNavOverflow(true);
    const user = userEvent.setup();
    const { rerender } = render(<SiteHeader />);
    const btn = screen.getByRole("button", { name: /Menu/ });
    await user.click(btn);
    nav.pathname = "/work";
    rerender(<SiteHeader />);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAccessibleName("Menu, current page: Work");
  });

  it("gains a shadow once the page scrolls", () => {
    render(<SiteHeader />);
    act(() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 40 });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByRole("banner")).toHaveAttribute("data-scrolled");
  });

  it("labels unknown routes", () => {
    nav.pathname = "/admin";
    render(<SiteHeader />);
    expect(screen.getByRole("button", { name: "Menu, current page: none" })).toBeInTheDocument();
  });
});
