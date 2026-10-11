import { describe, expect, it } from "vitest";
import { keepIndices, simplifyTopology, type Topology } from "./land";

describe("keepIndices", () => {
  it("drops points within the tolerance and keeps the endpoints", () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0.01],
      [2, -0.01],
      [3, 0.02],
      [4, 0],
    ];
    expect(keepIndices(line, 0.1)).toEqual([0, 4]);
    expect(keepIndices(line, 0.001)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps short arcs and closed rings intact enough to draw", () => {
    expect(keepIndices([[0, 0]], 1)).toEqual([0]);
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(keepIndices(ring, 0.1)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("simplifyTopology", () => {
  it("re-encodes the kept points as deltas in the same quantization", () => {
    const topo: Topology = {
      type: "Topology",
      transform: { scale: [0.5, 0.5], translate: [0, 0] },
      // absolute: (0,0) (2,0) (4,0) (4,4)
      arcs: [
        [
          [0, 0],
          [2, 0],
          [2, 0],
          [0, 4],
        ],
      ],
      objects: {},
    };
    const out = simplifyTopology(topo, 0.1);
    expect(out.arcs).toEqual([
      [
        [0, 0],
        [4, 0],
        [0, 4],
      ],
    ]);
    expect(out.objects).toEqual({});
    expect(out.transform).toBe(topo.transform);
  });
});
