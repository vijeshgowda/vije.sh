import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Renders the card as a browser in `timeZone` would, `msLeft` before that zone's midnight. */
async function renderIn(timeZone: string, midnight: number, msLeft: number) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...real.call(this), timeZone };
  });
  vi.useFakeTimers();
  vi.setSystemTime(midnight - msLeft);
  const { GtaCountdown } = await import("./GtaCountdown");
  render(<GtaCountdown />);
  await act(async () => {});
}

describe("GtaCountdown", () => {
  it("counts down to midnight in the visitor's time zone and names their country", async () => {
    await renderIn("Asia/Kolkata", Date.UTC(2026, 10, 18, 18, 30), (2 * 3600 + 5 * 60) * 1000);
    expect(screen.getByText("India", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("00:00 GMT+5:30")).toBeInTheDocument();
    expect(
      screen.getByText("0 days, 2 hours and 5 minutes to go until midnight in India."),
    ).toBeInTheDocument();
  });

  it("falls back to 'your time zone' when the zone has no country", async () => {
    await renderIn("UTC", Date.UTC(2026, 10, 19), 86_400_000);
    expect(screen.getByText("your time zone", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("00:00 GMT")).toBeInTheDocument();
  });
});
