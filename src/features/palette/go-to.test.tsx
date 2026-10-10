import { beforeEach, describe, expect, it, vi } from "vitest";
import { goTo, scrollToEl } from "./go-to";

const push = vi.fn();

function place(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  push.mockClear();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  Element.prototype.animate = vi.fn() as never;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 100 });
});

describe("scrollToEl", () => {
  it("lands the element just below the sticky header", () => {
    place(`<header></header><section id="s"></section>`);
    Object.defineProperty(document.querySelector("header")!, "offsetHeight", { value: 56 });
    const el = document.getElementById("s")!;
    el.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
    scrollToEl(el, true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 528, behavior: "smooth" });
    el.getBoundingClientRect = () => ({ top: -500 }) as DOMRect;
    scrollToEl(el, false);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });
});

describe("goTo", () => {
  it("opens another page", () => {
    goTo(push, { type: "go", href: "/work" });
    expect(push).toHaveBeenCalledWith("/work");
  });

  it("scrolls to the top when the page is already open", () => {
    goTo(push, { type: "go", href: "/" });
    expect(push).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("rings a target on this page, or clicks it when asked", () => {
    place(`<section id="cluster"></section><button id="flash"></button>`);
    goTo(push, { type: "go", href: "/", selector: "#cluster" });
    expect(document.getElementById("cluster")!.animate).toHaveBeenCalled();
    const flash = vi.fn();
    document.getElementById("flash")!.addEventListener("click", flash);
    goTo(push, { type: "go", href: "/", selector: "#flash", click: true });
    expect(flash).toHaveBeenCalledOnce();
    document.getElementById("flash")!.setAttribute("disabled", "");
    goTo(push, { type: "go", href: "/", selector: "#flash", click: true });
    expect(flash).toHaveBeenCalledOnce();
  });

  it("waits for the new page before looking for the target, even if the old page has one too", async () => {
    place(`<article id="feed-hn"></article>`);
    const oldCard = document.getElementById("feed-hn")!;
    goTo(push, { type: "go", href: "/live", selector: "#feed-hn" });
    expect(push).toHaveBeenCalledWith("/live");
    await new Promise((r) => setTimeout(r, 50));
    expect(oldCard.animate).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/live");
    await vi.waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(oldCard.animate).toHaveBeenCalled();
  });

  it("re-aims after late layout shifts until the visitor scrolls", () => {
    vi.useFakeTimers();
    place(`<section id="notes"></section>`);
    goTo(push, { type: "go", href: "/", selector: "#notes" });
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("wheel"));
    vi.advanceTimersByTime(2000);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("gives up quietly when the target never appears", () => {
    vi.useFakeTimers();
    goTo(push, { type: "go", href: "/", selector: "#missing" });
    vi.advanceTimersByTime(6000);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
