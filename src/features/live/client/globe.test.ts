import { describe, expect, it } from "vitest";
import { decodeLand } from "./globe";

describe("decodeLand", () => {
  it("turns delta-encoded TopoJSON arcs into unit vectors", () => {
    const [arc] = decodeLand({
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [
        [
          [0, 0],
          [90, 0],
          [-90, 90],
        ],
      ],
    });
    const v = Array.from(arc!, (n) => Math.round(n * 1e6) / 1e6 + 0);
    expect(v).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});
