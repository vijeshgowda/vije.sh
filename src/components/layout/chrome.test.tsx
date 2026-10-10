import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackToTop } from "./BackToTop";
import { NetStatus } from "./NetStatus";
import { Toaster } from "./Toaster";
import { toast } from "./toast";

const uartMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/uart", () => ({ uart: uartMock }));

function setScroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  setScroll(0);
});

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.offline;
});

describe("Toaster", () => {
  it("shows a message, hides it, then empties the live region", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    const region = screen.getByRole("status");
    act(() => toast("Link copied"));
    expect(region).toHaveTextContent("Link copied");
    expect(region).toHaveAttribute("data-on");
    act(() => vi.advanceTimersByTime(2800));
    expect(region).not.toHaveAttribute("data-on");
    expect(region).toHaveTextContent("Link copied");
    act(() => vi.advanceTimersByTime(300));
    expect(region).toBeEmptyDOMElement();
  });

  it("a new message replaces the current one and restarts the timer", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => toast("One"));
    act(() => vi.advanceTimersByTime(2000));
    act(() => toast("Two"));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("status")).toHaveTextContent("Two");
    expect(screen.getByRole("status")).toHaveAttribute("data-on");
  });
});

describe("BackToTop", () => {
  it("appears after 1.5 screens, scrolls to the top and moves focus to main", async () => {
    const user = userEvent.setup();
    render(
      <>
        <main id="main" tabIndex={-1} />
        <BackToTop />
      </>,
    );
    expect(screen.queryByRole("button", { name: /Top/ })).not.toBeInTheDocument();
    act(() => setScroll(1100));
    expect(screen.queryByRole("button", { name: /Top/ })).not.toBeInTheDocument();
    act(() => setScroll(1300));
    await user.click(screen.getByRole("button", { name: /Top/ }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.getElementById("main")).toHaveFocus();
  });

  it("jumps without smooth scrolling when motion is reduced", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;
    const user = userEvent.setup();
    render(<BackToTop />);
    act(() => setScroll(5000));
    await user.click(screen.getByRole("button", { name: /Top/ }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("hides while the footer is on screen", () => {
    let fire: IntersectionObserverCallback = () => {};
    const Original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      render(
        <>
          <BackToTop />
          <footer />
        </>,
      );
      act(() => setScroll(5000));
      expect(screen.getByRole("button", { name: /Top/ })).toBeInTheDocument();
      act(() =>
        fire([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
      );
      expect(screen.queryByRole("button", { name: /Top/ })).not.toBeInTheDocument();
    } finally {
      globalThis.IntersectionObserver = Original;
    }
  });
});

describe("NetStatus", () => {
  it("greys the LED, logs and toasts when the link drops and returns", () => {
    render(
      <>
        <NetStatus />
        <Toaster />
      </>,
    );
    const root = document.documentElement;
    expect(root).not.toHaveAttribute("data-offline");
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(root).toHaveAttribute("data-offline");
    expect(uartMock).toHaveBeenLastCalledWith("net: link down");
    expect(screen.getByRole("status")).toHaveTextContent("Offline.");
    act(() => void window.dispatchEvent(new Event("online")));
    expect(root).not.toHaveAttribute("data-offline");
    expect(uartMock).toHaveBeenLastCalledWith("net: link up");
    expect(screen.getByRole("status")).toHaveTextContent("Back online.");
  });

  it("starts offline when the page loads without a connection", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<NetStatus />);
    expect(document.documentElement).toHaveAttribute("data-offline");
    vi.restoreAllMocks();
  });
});
