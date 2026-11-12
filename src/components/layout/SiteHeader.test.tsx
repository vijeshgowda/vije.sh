import { act, render, screen, within } from "@testing-library/react";
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
  it("marks the current page and lists the datasheet pages and Omni", () => {
    render(<SiteHeader />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getAllByRole("link")).toHaveLength(8);
    expect(screen.getByRole("link", { name: /P7\s*Live/ })).toHaveAttribute("aria-current", "page");
    expect(within(main).getByRole("link", { name: /P8\s*Omni/ })).toHaveAttribute(
      "href",
      "/lab/omni",
    );
    expect(screen.getByRole("banner")).toHaveAttribute("data-fit", "full");
  });

  it("marks Omni instead of Lab as current and updates the compact menu", () => {
    setNavOverflow(true);
    nav.pathname = "/lab/omni";
    const { rerender } = render(<SiteHeader />);
    const main = screen.getByRole("navigation", { name: "Main" });
    const omni = within(main).getByRole("link", { name: /P8\s*Omni/ });
    const lab = within(main).getByRole("link", { name: /P3\s*Lab/ });
    expect(omni).toHaveAttribute("aria-current", "page");
    expect(lab).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Menu, current page: Omni" })).toHaveTextContent(
      /P8\s*Omni/,
    );

    nav.pathname = "/lab";
    rerender(<SiteHeader />);
    expect(lab).toHaveAttribute("aria-current", "page");
    expect(omni).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Menu, current page: Lab" })).toBeInTheDocument();
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
