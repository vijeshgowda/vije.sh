import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";
import { revealDelay, scramble, setupReveal } from "./reveal";
import { Spotlight } from "./Spotlight";

let fire: (targets: Element[]) => void = () => {};
const observed = new Set<Element>();

function mockMedia(matches: (q: string) => boolean) {
  window.matchMedia = vi.fn((q: string) => ({ matches: matches(q) })) as never;
}

function at(el: Element, top: number) {
  el.getBoundingClientRect = () => ({ top, left: 10 }) as DOMRect;
}

beforeEach(() => {
  observed.clear();
  mockMedia(() => false);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Element.prototype.animate = vi.fn() as never;
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      fire = (targets) =>
        cb(
          targets.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
          this as unknown as IntersectionObserver,
        );
    }
    observe(el: Element) {
      observed.add(el);
    }
    unobserve(el: Element) {
      observed.delete(el);
    }
    disconnect() {
      observed.clear();
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

function group(tops: number[]) {
  const root = document.createElement("ul");
  tops.forEach((top, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span data-scramble>${10 + i}</span>`;
    at(li, top);
    root.append(li);
  });
  document.body.append(root);
  return root;
}

describe("revealDelay", () => {
  it("staggers by 70 ms and caps at the eighth item", () => {
    expect([0, 1, 2, 8, 20].map(revealDelay)).toEqual([0, 70, 140, 560, 560]);
  });
});

describe("setupReveal", () => {
  it("leaves on-screen items alone and hides the rest until they scroll in", () => {
    const root = group([100, 900, 1200]);
    const [a, b, c] = Array.from(root.children) as HTMLElement[];
    setupReveal(root);
    expect(a!.style.opacity).toBe("");
    expect(b!.style.opacity).toBe("0");
    expect(c!.style.opacity).toBe("0");
    expect(observed).toEqual(new Set([b, c]));

    fire([c!]);
    expect(c!.style.opacity).toBe("");
    expect(observed).toEqual(new Set([b]));
    expect(c!.animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ delay: 140, fill: "backwards" }),
    );
  });

  it("does nothing when motion is reduced", () => {
    mockMedia((q) => q.includes("reduce"));
    const root = group([900]);
    setupReveal(root);
    expect((root.firstElementChild as HTMLElement).style.opacity).toBe("");
    expect(observed.size).toBe(0);
  });

  it("reveals the element itself and draws its rule", () => {
    const el = document.createElement("div");
    at(el, 1000);
    document.body.append(el);
    setupReveal(el, { self: true, rule: true });
    expect(el.style.opacity).toBe("0");
    fire([el]);
    expect(el.animate).toHaveBeenCalledWith(
      [{ width: "0" }, { width: "4rem" }],
      expect.objectContaining({ pseudoElement: "::after", delay: 200 }),
    );
  });

  it("scrambles numbers inside a revealed item, and cleanup restores everything", () => {
    vi.useFakeTimers();
    const root = group([900, 1000]);
    const [a, b] = Array.from(root.children) as HTMLElement[];
    const stop = setupReveal(root);
    fire([a!]);
    vi.advanceTimersByTime(45);
    expect(a!.textContent).toMatch(/^\d\d$/);
    stop();
    expect(a!.textContent).toBe("10");
    expect(b!.style.opacity).toBe("");
    expect(observed.size).toBe(0);
  });

  it("returns a no-op when every item is already on screen", () => {
    const root = group([0, 50]);
    setupReveal(root)();
    expect(observed.size).toBe(0);
  });
});

describe("scramble", () => {
  it("rolls digits for 12 frames, then settles on the real value", () => {
    vi.useFakeTimers();
    const el = document.createElement("td");
    el.textContent = "45";
    const text = el.firstChild;
    scramble(el, () => 0.99);
    vi.advanceTimersByTime(45);
    expect(el.textContent).toBe("99");
    vi.advanceTimersByTime(45 * 12);
    expect(el.textContent).toBe("45");
    // same text node: React's reference stays valid
    expect(el.firstChild).toBe(text);
  });

  it("ignores anything that isn't a plain number", () => {
    vi.useFakeTimers();
    for (const html of ["\u2014", "now", "<b>12</b>", ""]) {
      const el = document.createElement("td");
      el.innerHTML = html;
      scramble(el)();
      vi.advanceTimersByTime(100);
      expect(el.innerHTML).toBe(html);
    }
  });
});

describe("<Reveal>", () => {
  it("renders the requested element and hides children below the fold", () => {
    at(HTMLElement.prototype, 2000);
    render(
      <table>
        <Reveal as="tbody" data-testid="body">
          <tr>
            <td>1</td>
          </tr>
        </Reveal>
      </table>,
    );
    const body = screen.getByTestId("body");
    expect(body.tagName).toBe("TBODY");
    expect((body.firstElementChild as HTMLElement).style.opacity).toBe("0");
    delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
  });
});

describe("<Spotlight>", () => {
  it("feeds the pointer position to [data-spotlight] elements", () => {
    mockMedia((q) => q.includes("pointer"));
    render(
      <>
        <Spotlight />
        <article data-spotlight data-testid="card">
          <p>inside</p>
        </article>
      </>,
    );
    const card = screen.getByTestId("card");
    at(card, 100);
    act(() => {
      screen
        .getByText("inside")
        .dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 50, clientY: 130 }));
    });
    expect(card.style.getPropertyValue("--mx")).toBe("40px");
    expect(card.style.getPropertyValue("--my")).toBe("30px");
  });

  it("stays off for coarse pointers", () => {
    render(
      <>
        <Spotlight />
        <article data-spotlight data-testid="card" />
      </>,
    );
    const card = screen.getByTestId("card");
    act(() => {
      card.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5 }));
    });
    expect(card.style.getPropertyValue("--mx")).toBe("");
  });
});
