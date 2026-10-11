import { describe, expect, it } from "vitest";
import { packetFrames, pathPoints } from "./packets";

describe("pathPoints", () => {
  it("reads absolute M, L, H and V commands", () => {
    expect(pathPoints("M118 146 H34")).toEqual([
      [118, 146],
      [34, 146],
    ]);
    expect(pathPoints("M146 118 V104 L104 90 V40")).toEqual([
      [146, 118],
      [146, 104],
      [104, 90],
      [104, 40],
    ]);
  });
});

describe("packetFrames", () => {
  it("spaces keyframes by segment length and scales to px", () => {
    const f = packetFrames(
      [
        [0, 0],
        [30, 0],
        [30, 10],
      ],
      2,
    );
    expect(f.map((k) => k.offset)).toEqual([0, 0.75, 1]);
    expect(f[1]!.transform).toBe("translate(60.0px, 0.0px)");
  });

  it("copes with a single point", () => {
    expect(packetFrames([[5, 5]], 1)).toEqual([
      { offset: 0, transform: "translate(5.0px, 5.0px)" },
    ]);
  });
});
