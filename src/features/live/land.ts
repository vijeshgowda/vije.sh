/**
 * Coastline simplification for the globe's TopoJSON (scripts/simplify-land.ts). Each arc keeps its
 * endpoints, so arcs that meet still join and the topology stays valid.
 */

export type QPoint = [number, number];

export interface Topology {
  type: "Topology";
  transform: { scale: [number, number]; translate: [number, number] };
  /** Delta-encoded, quantized positions */
  arcs: QPoint[][];
  [key: string]: unknown;
}

const dist2 = (p: QPoint, a: QPoint, b: QPoint) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
};

/** Douglas-Peucker: indices of the points to keep, always including the first and the last */
export function keepIndices(pts: QPoint[], tol: number): number[] {
  if (pts.length < 3) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let max = tol2;
    for (let i = a + 1; i < b; i++) {
      const d = dist2(pts[i]!, pts[a]!, pts[b]!);
      if (d > max) {
        max = d;
        worst = i;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([a, worst], [worst, b]);
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

/** Simplifies every arc to `tolDeg` degrees (measured in lon/lat), keeping the quantization */
export function simplifyTopology(topo: Topology, tolDeg: number): Topology {
  const [sx, sy] = topo.transform.scale;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const q = arc.map(([dx, dy]): QPoint => [(x += dx), (y += dy)]);
    const kept = keepIndices(
      q.map(([qx, qy]): QPoint => [qx * sx, qy * sy]),
      tolDeg,
    );
    return kept.map((k, i): QPoint => {
      const prev = i ? q[kept[i - 1]!]! : [0, 0];
      return [q[k]![0] - prev[0], q[k]![1] - prev[1]];
    });
  });
  return { ...topo, arcs };
}
