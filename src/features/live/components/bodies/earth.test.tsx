import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { globeBus } from "../../client/globe-bus";
import type { Quake } from "../../types";
import { Quakes } from "./earth";

const q = (place: string, mag: number, time: number): Quake => ({
  mag,
  place,
  time,
  url: null,
  lon: 0,
  lat: 0,
  depth: 10,
});

describe("Quakes", () => {
  afterEach(() => globeBus.set({ globes: 0, quakePick: null, quakeHover: null }));

  it("shows the 24 h total, not the length of the trimmed list, and publishes to the globe", () => {
    const events = [q("A", 4.8, 3), q("B", 6.4, 2), q("C", 5, 1)];
    render(<Quakes data={{ total: 140, events }} at={42} />);
    expect(screen.getByText("140")).toBeTruthy();
    expect(screen.getByText(/strongest M6\.4/)).toBeTruthy();
    expect(globeBus.get().quakes).toBe(events);
    expect(globeBus.get().quakeMeta).toEqual({ total: 140, at: 42 });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rows pick a quake on the globe when one is mounted", () => {
    act(() => globeBus.set({ globes: 1 }));
    const events = [q("Near Tonga", 6.1, 2), q("Off Chile", 5, 1)];
    render(<Quakes data={{ total: 2, events }} at={1} />);
    const row = screen.getByRole("button", { name: /Near Tonga.*Show on the globe/ });
    fireEvent.focus(row);
    expect(globeBus.get().quakeHover).toBe(events[0]);
    fireEvent.click(row);
    expect(globeBus.get().quakePick).toEqual({ quake: events[0], focus: true });
    expect(row.getAttribute("aria-pressed")).toBe("true");
  });
});
