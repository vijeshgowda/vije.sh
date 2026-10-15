import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));
const loadLand = vi.fn(async (_res: string) => null);
vi.mock("../client/globe", () => ({ loadLand: (res: string) => loadLand(res) }));
const warmIss = vi.fn(async () => {});
vi.mock("../client/iss", () => ({ warmIss: () => warmIss() }));
const warmWeather = vi.fn(async () => {});
vi.mock("../client/weather", () => ({ warmWeather: () => warmWeather() }));

function size(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function mount() {
  const { LivePreload } = await import("./LivePreload");
  return render(<LivePreload />);
}

describe("<LivePreload>", () => {
  it("renders nothing and warms /live once the browser is idle", async () => {
    size(1280, 800);
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
    expect(prefetch).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(prefetch).toHaveBeenCalledWith("/live");
    expect(loadLand).toHaveBeenCalledWith("50m");
    expect(warmIss).toHaveBeenCalledOnce();
    expect(warmWeather).toHaveBeenCalledOnce();
  });

  it("loads the coarse coastlines on small screens", async () => {
    size(390, 844);
    await mount();
    vi.runAllTimers();
    expect(loadLand).toHaveBeenCalledWith("110m");
  });

  it("does not run again when the overview mounts a second time", async () => {
    size(1280, 800);
    const { unmount } = await mount();
    vi.runAllTimers();
    unmount();
    const { LivePreload } = await import("./LivePreload");
    render(<LivePreload />);
    vi.runAllTimers();
    expect(warmIss).toHaveBeenCalledOnce();
  });

  it("does nothing if it unmounts before the browser is idle", async () => {
    size(1280, 800);
    const { unmount } = await mount();
    unmount();
    vi.runAllTimers();
    expect(prefetch).not.toHaveBeenCalled();
  });
});
