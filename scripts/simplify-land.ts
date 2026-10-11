/**
 * Simplifies world-atlas coastlines for the big globe (src/features/live/land.ts). Run it on the
 * original file (https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json), not on its own output:
 *   npx tsx scripts/simplify-land.ts <world-atlas land-50m.json> public/data/land-50m.json [deg]
 * The default tolerance, 0.06 degrees, is under half a device pixel on the largest globe (radius
 * about 290 CSS px at 1.5x).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { simplifyTopology, type Topology } from "../src/features/live/land";

const [input, output, tol = "0.06"] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: tsx scripts/simplify-land.ts <in.json> <out.json> [tolerance in degrees]");
  process.exit(1);
}
const topo = JSON.parse(readFileSync(input, "utf8")) as Topology;
const out = simplifyTopology(topo, Number(tol));
const count = (t: Topology) => t.arcs.reduce((n, a) => n + a.length, 0);
writeFileSync(output, JSON.stringify(out));
console.log(`land: ${count(topo)} -> ${count(out)} points (tolerance ${tol} degrees)`);
