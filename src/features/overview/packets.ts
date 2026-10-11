/** Chip packets: points of a trace's SVG path and WAAPI keyframes that move a dot along it. */

export type Point = [number, number];

/** Vertices of an absolute M/L/H/V path, the only commands the chip traces use */
export function pathPoints(d: string): Point[] {
  const pts: Point[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHV])([^MLHV]*)/g)) {
    const n = args!
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (cmd === "H") x = n[0]!;
    else if (cmd === "V") y = n[0]!;
    else [x, y] = [n[0]!, n[1]!];
    pts.push([x, y]);
  }
  return pts;
}

/** Constant-speed keyframes along `pts`, scaled from SVG units to CSS px */
export function packetFrames(pts: Point[], scale: number): Keyframe[] {
  const lens = pts.map((p, i) =>
    i ? Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) : 0,
  );
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let run = 0;
  return pts.map(([x, y], i) => {
    run += lens[i]!;
    return {
      offset: run / total,
      transform: `translate(${(x * scale).toFixed(1)}px, ${(y * scale).toFixed(1)}px)`,
    };
  });
}
