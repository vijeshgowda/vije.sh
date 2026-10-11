import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { globeBus } from "../../client/globe-bus";
import type { Launch } from "../../types";
import { LaunchMonth, Launches } from "./space";

const launch = (i: number): Launch => ({
  name: `Launch ${i}`,
  net: `2099-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
  status: "Go",
  statusName: "Go for Launch",
  provider: "SpaceX",
  location: "Cape Canaveral, FL, USA",
  lat: 28.5,
  lon: -80.6,
  orbit: "LEO",
});

describe("Launches", () => {
  it("shows the nearest 5, then all 15 on request, and puts the shown pads on the globe", () => {
    const launches = Array.from({ length: 15 }, (_, i) => launch(i));
    render(<Launches data={{ launches, month: null }} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(globeBus.get().pads).toHaveLength(5);

    const more = screen.getByRole("button", { name: "Show 10 more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    expect(globeBus.get().pads).toHaveLength(15);

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("has no show-more button for 5 or fewer launches", () => {
    render(<Launches data={{ launches: [launch(0)], month: null }} />);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });
});

describe("LaunchMonth", () => {
  it("counts this month's launches, or shows nothing without a count", () => {
    const { container, rerender } = render(
      <LaunchMonth
        data={{ launches: [], month: { start: "2026-10-01T00:00:00.000Z", count: 16 } }}
      />,
    );
    expect(container.textContent).toBe("16 launches this month");
    expect(container.firstElementChild).toHaveAttribute(
      "title",
      "Launches with a target date in October 2026 (UTC)",
    );
    rerender(<LaunchMonth data={{ launches: [], month: null }} />);
    expect(container.textContent).toBe("");
  });
});
