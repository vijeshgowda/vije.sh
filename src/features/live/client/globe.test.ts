import { describe, expect, it } from "vitest";
import { decodeLand, landResFor, traceArc, xyz, type View } from "./globe";

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

// Looking at lon 0, lat 0 on a globe of radius 100 centred at (0, 0): x = 100 sin(lon)
const VIEW: View = { cx: 0, cy: 0, R: 100, cl: 1, sl: 0, sp: 0, cp0: 1 };
const arc = (lons: number[], lat = 0) => Float32Array.from(lons.flatMap((lon) => xyz(lon, lat)));

function trace(v: Float32Array, minD?: number) {
  const ops: string[] = [];
  const r = (n: number) => Math.round(n * 10) / 10 + 0;
  traceArc(
    v,
    VIEW,
    {
      moveTo: (x, y) => ops.push(`M${r(x)},${r(y)}`),
      lineTo: (x, y) => ops.push(`L${r(x)},${r(y)}`),
    },
    minD,
  );
  return ops;
}

describe("traceArc", () => {
  it("projects every point when no minimum distance is given", () => {
    expect(trace(arc([0, 30, 90]))).toEqual(["M0,0", "L50,0", "L100,0"]);
  });

  it("skips points closer than minD to the last one drawn but keeps the last point", () => {
    // 0.2 degrees apart is about 0.35 px at R = 100
    expect(trace(arc([0, 0.2, 0.4, 30]))).toHaveLength(4);
    expect(trace(arc([0, 0.2, 0.4, 30]), 1)).toEqual(["M0,0", "L50,0"]);
    expect(trace(arc([0, 0.2, 0.4]), 1)).toEqual(["M0,0", "L0.7,0"]);
  });

  it("breaks the line at the horizon, finishing a skipped point first", () => {
    // 100 and 120 degrees are on the far side
    expect(trace(arc([60, 80, 80.2, 100, 120, 280, 300]), 1)).toEqual([
      "M86.6,0",
      "L98.5,0",
      "L98.5,0",
      "M-98.5,0",
      "L-86.6,0",
    ]);
  });
});

describe("landResFor", () => {
  it("uses 50m coastlines only on big globes", () => {
    expect(landResFor(145)).toBe("110m");
    expect(landResFor(179)).toBe("110m");
    expect(landResFor(180)).toBe("50m");
    expect(landResFor(290)).toBe("50m");
  });
});
