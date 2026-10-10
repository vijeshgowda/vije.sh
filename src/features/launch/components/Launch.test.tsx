import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "@/lib/storage";
import { countsAsTyping, landed, launch } from "../launch";
import { Launch } from "./Launch";
import { LaunchButton } from "./LaunchButton";

const uartMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/uart", () => ({ uart: uartMock }));

function reduceMotion(on: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: on }) as typeof window.matchMedia;
}

const count = () => screen.queryByRole("status");

beforeEach(() => {
  reduceMotion(true);
  uartMock.mockClear();
});

afterEach(() => {
  act(() => landed());
  vi.useRealTimers();
  delete (Element.prototype as Partial<Element>).animate;
});

describe("countsAsTyping", () => {
  const key = (init: KeyboardEventInit, target?: Element) => {
    const e = new KeyboardEvent("keydown", init);
    if (target) Object.defineProperty(e, "target", { value: target });
    return e;
  };

  it("accepts plain printable keys and rejects shortcuts, named keys and form fields", () => {
    expect(countsAsTyping(key({ key: "l" }, document.body))).toBe(true);
    expect(countsAsTyping(key({ key: "l" }))).toBe(true);
    expect(countsAsTyping(key({ key: "l", ctrlKey: true }))).toBe(false);
    expect(countsAsTyping(key({ key: "l", altKey: true }))).toBe(false);
    expect(countsAsTyping(key({ key: "Enter" }))).toBe(false);
    expect(countsAsTyping(key({ key: "l" }, document.createElement("input")))).toBe(false);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(countsAsTyping(key({ key: "l" }, editable))).toBe(false);
  });
});

describe("<Launch>", () => {
  it("launches when the word is typed, but not while typing in a field", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Search" />
        <Launch />
      </>,
    );
    await user.type(screen.getByLabelText("Search"), "launch");
    expect(count()).not.toBeInTheDocument();
    await user.click(document.body);
    await user.keyboard("launch");
    expect(await screen.findByRole("status")).toHaveTextContent("Liftoff");
    expect(uartMock).toHaveBeenCalledWith("launch: sequence start. T-3.");
  });

  it("with reduced motion shows Liftoff, then lands", () => {
    vi.useFakeTimers();
    render(<Launch />);
    act(() => launch());
    act(() => vi.advanceTimersByTime(0));
    expect(count()).toHaveTextContent("Liftoff");
    act(() => vi.advanceTimersByTime(1400));
    expect(count()).not.toBeInTheDocument();
    expect(uartMock).toHaveBeenLastCalledWith("launch: nominal.");
  });

  it("counts down, lifts off, logs the flight number and fades out", () => {
    vi.useFakeTimers();
    reduceMotion(false);
    const anims: { onfinish: (() => void) | null }[] = [];
    Element.prototype.animate = vi.fn(() => {
      const a = { onfinish: null };
      anims.push(a);
      return a;
    }) as never;
    storage.set("launches", 2);
    render(
      <>
        <main id="main" />
        <Launch />
      </>,
    );
    act(() => launch());
    act(() => vi.advanceTimersByTime(0));
    expect(count()).toHaveTextContent("T-3");
    act(() => vi.advanceTimersByTime(650));
    expect(count()).toHaveTextContent("T-2");
    act(() => vi.advanceTimersByTime(1300));
    expect(count()).toHaveTextContent("Liftoff");
    expect(document.querySelector("svg")?.getAttribute("class")).toMatch(/go/);

    // the last animation started at liftoff is the climb; then the overlay fades
    act(() => anims.at(-1)!.onfinish!());
    expect(storage.get("launches", 0)).toBe(3);
    expect(uartMock).toHaveBeenLastCalledWith(
      "launch: nominal. orbit reached (probably). flights: 3",
    );
    expect(count()).toBeInTheDocument();
    act(() => anims.at(-1)!.onfinish!());
    expect(count()).not.toBeInTheDocument();
  });

  it("lands straight away where the Web Animations API is missing", () => {
    vi.useFakeTimers();
    reduceMotion(false);
    render(<Launch />);
    act(() => launch());
    act(() => vi.advanceTimersByTime(1950));
    expect(count()).not.toBeInTheDocument();
    expect(storage.get("launches", 0)).toBe(1);
  });

  it("only flies one rocket at a time, and the footer button starts it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LaunchButton />
        <Launch />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Launch" }));
    await user.click(screen.getByRole("button", { name: "Launch" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(uartMock).toHaveBeenCalledTimes(1);
  });
});
