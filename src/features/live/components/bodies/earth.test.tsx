import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  it("shows the 24 h total, not the length of the trimmed list, and publishes to the globe", () => {
    const events = [q("A", 4.8, 3), q("B", 6.4, 2), q("C", 5, 1)];
    render(<Quakes data={{ total: 140, events }} />);
    expect(screen.getByText("140")).toBeTruthy();
    expect(screen.getByText(/strongest M6\.4/)).toBeTruthy();
    expect(globeBus.get().quakes).toBe(events);
  });
});
