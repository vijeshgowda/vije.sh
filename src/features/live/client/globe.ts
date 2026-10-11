/**
 * Orthographic canvas globe for LF-01: coastlines (TopoJSON), day/night dots, ISS + ground track,
 * launch pads and earthquake rings. Plain DOM/canvas, no React; IssFeed owns its lifecycle.
 */
import { sameQuake, strongest } from "../format";
import type { Launch, Quake } from "../types";

const RAD = Math.PI / 180;
type LonLat = [number, number];
type Vec3 = [number, number, number];

/** Coastline arcs as flat [x, y, z] unit vectors, so drawing a frame is one rotation per point */
export type Land = Float32Array[];
/** 110m for small globes; 50m (about 12x the points) where the globe is big enough to show it */
export type LandRes = "110m" | "50m";
interface Topo {
  transform: { scale: LonLat; translate: LonLat };
  arcs: LonLat[][];
}

export function decodeLand(t: Topo): Land {
  const [sx, sy] = t.transform.scale;
  const [tx, ty] = t.transform.translate;
  return t.arcs.map((a) => {
    const out = new Float32Array(a.length * 3);
    let x = 0;
    let y = 0;
    a.forEach(([dx, dy], i) => {
      x += dx;
      y += dy;
      out.set(xyz(x * sx + tx, y * sy + ty), i * 3);
    });
    return out;
  });
}

const landReq: Partial<Record<LandRes, Promise<Land | null>>> = {};

/** Coastlines, self-hosted (public/data/land-*.json, world-atlas@2, ISC) */
export function loadLand(res: LandRes = "110m"): Promise<Land | null> {
  return (landReq[res] ??= fetch(`/data/land-${res}.json`)
    .then((r) => r.json() as Promise<Topo>)
    .then(decodeLand)
    .catch(() => {
      delete landReq[res];
      return null;
    }));
}

/** Day/night dot grid as unit vectors, `step` degrees apart */
function dotGrid(step: number): Float32Array {
  const pts: number[] = [];
  for (let la = -84; la <= 84; la += step) {
    const n = Math.max(1, Math.round((360 / step) * Math.cos(la * RAD)));
    for (let k = 0; k < n; k++) pts.push(...xyz((k / n) * 360 - 180, la));
  }
  return Float32Array.from(pts);
}

export const xyz = (lon: number, lat: number): Vec3 => [
  Math.cos(lat * RAD) * Math.cos(lon * RAD),
  Math.cos(lat * RAD) * Math.sin(lon * RAD),
  Math.sin(lat * RAD),
];
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (w < 1e-6) return a;
  const s = Math.sin(w);
  const k1 = Math.sin((1 - t) * w) / s;
  const k2 = Math.sin(t * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

/** Point on Earth where the sun is overhead (approximate) */
export function subsolar(now = new Date()): LonLat {
  const doy =
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), 0, 0)) /
    864e5;
  return [
    -15 * (now.getUTCHours() + now.getUTCMinutes() / 60 - 12),
    -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10)),
  ];
}

export interface IssPosition {
  latitude: number;
  longitude: number;
}

export interface Layers {
  iss: boolean;
  pads: boolean;
  quakes: boolean;
}

/** Screen centre and radius (CSS px) and the sines and cosines of the view's centre lon/lat */
export interface View {
  cx: number;
  cy: number;
  R: number;
  cl: number;
  sl: number;
  sp: number;
  cp0: number;
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
}

/**
 * Projects a polyline of unit vectors orthographically, breaking it at the horizon and skipping
 * points closer than `minD` px to the last one drawn; the last visible point is always kept.
 */
export function traceArc(v: Float32Array, w: View, out: PathSink, minD = 0) {
  const { cx, cy, R, cl, sl, sp, cp0 } = w;
  let on = false;
  let pending = false;
  let lx = 0;
  let ly = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i]!;
    const y = v[i + 1]!;
    const z = v[i + 2]!;
    const a = x * cl + y * sl;
    if (sp * z + cp0 * a < 0) {
      if (pending) out.lineTo(px, py);
      on = pending = false;
      continue;
    }
    px = cx + R * (y * cl - x * sl);
    py = cy - R * (cp0 * z - sp * a);
    if (!on) out.moveTo(px, py);
    else if (Math.abs(px - lx) + Math.abs(py - ly) < minD) {
      pending = true;
      continue;
    } else out.lineTo(px, py);
    on = true;
    pending = false;
    lx = px;
    ly = py;
  }
  if (pending) out.lineTo(px, py);
}

/** 50m coastlines only where the globe is big enough to show them (radius in CSS px) */
export const landResFor = (radius: number): LandRes => (radius >= 180 ? "50m" : "110m");

const HOME = { lon: -40, lat: 22 };
/** Auto-spin, degrees per ms */
const SPIN = 0.004;
/** Spin and pulses run at about 30 fps; dragging runs at the display rate */
const FRAME_MS = 30;
/** Coastline and graticule points closer than this (CSS px) to the last one drawn are skipped */
const MIN_SEG = 0.9;

/** Meridians and parallels `step` degrees apart, as unit-vector polylines */
function graticule(step: number): Float32Array[] {
  const poly = (pts: LonLat[]) => Float32Array.from(pts.flatMap(([lo, la]) => xyz(lo, la)));
  const out: Float32Array[] = [];
  for (let lo = -180; lo < 180; lo += step)
    out.push(poly(Array.from({ length: 61 }, (_, k): LonLat => [lo, -90 + k * 3])));
  for (let la = -90 + step; la < 90; la += step)
    out.push(poly(Array.from({ length: 121 }, (_, k): LonLat => [-180 + k * 3, la])));
  return out;
}

/**
 * Three stacked canvases: the disc (redrawn on resize and theme change), the map (redrawn only
 * when the view or the data changes) and an overlay for the pulses and the ISS (every frame).
 */
export function createGlobe(
  wrap: HTMLElement,
  opts: {
    reduceMotion: () => boolean;
    onPickQuake?: (q: Quake) => void;
    /** called when the globe scrolls into or out of view */
    onVisible?: (visible: boolean) => void;
    /** big globe: denser dot grid and graticule */
    detail?: boolean;
  },
) {
  const layer = (name: string) => {
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    c.dataset.layer = name;
    return [c, c.getContext("2d")!] as const;
  };
  const [discCv, dc] = layer("disc");
  const [mapCv, ctx] = layer("map");
  const [fxCv, fc] = layer("fx");
  wrap.prepend(discCv, mapCv, fxCv);
  const dots = dotGrid(opts.detail ? 3 : 4);
  const grat = graticule(opts.detail ? 15 : 30);
  let land: Land | null = null;
  let landAsked: LandRes | null = null;
  let landHave: LandRes | null = null;
  let alive = true;
  let W = 0;
  let H = 0;
  let R = 0;
  let cx = 0;
  let cy = 0;
  let lon0 = HOME.lon;
  let lat0 = HOME.lat;
  let drag: [number, number, number, number] | null = null;
  let moved = false;
  let follow = false;
  let paused = false;
  let show: Layers = { iss: true, pads: true, quakes: true };
  let raf = 0;
  let vis = true;
  let last = 0;
  // the map layer needs a redraw
  let dirty = true;
  let col = {
    ink: "",
    line: "",
    card: "",
    faint: "",
    red: "#e30613",
    redt: "",
    quake: "",
    sh: "",
  };
  let iss: IssPosition | null = null;
  let track: Float32Array | null = null;
  let pads: Launch[] = [];
  let hi = -1;
  let quakes: Quake[] = [];
  let topQuake: Quake | null = null;
  let qHover: Quake | null = null;
  let qPick: Quake | null = null;
  const reduce = opts.reduceMotion;
  const quakeR = (q: Quake) => 4 + Math.max(0, q.mag - 4.5) * 3.5;

  const readCol = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    const dark = document.documentElement.dataset.theme === "dark";
    col = {
      ink: v("--ink"),
      line: v("--line2"),
      card: v("--card"),
      faint: v("--faint"),
      red: "#e30613",
      redt: v("--red-t"),
      quake: v("--quake"),
      sh: `rgb(${v("--sc")} / ${dark ? 0.7 : 0.3})`,
    };
  };
  const view: View = { cx: 0, cy: 0, R: 0, cl: 1, sl: 0, sp: 0, cp0: 1 };
  const setView = () => {
    Object.assign(view, {
      cx,
      cy,
      R,
      cl: Math.cos(lon0 * RAD),
      sl: Math.sin(lon0 * RAD),
      sp: Math.sin(lat0 * RAD),
      cp0: Math.cos(lat0 * RAD),
    });
  };
  /** Screen x, y and depth (negative on the far side) of a point, for the current view */
  const P = (lon: number, lat: number): Vec3 => {
    const [x, y, z] = xyz(lon, lat);
    const { cl, sl, sp, cp0 } = view;
    const a = x * cl + y * sl;
    return [
      view.cx + view.R * (y * cl - x * sl),
      view.cy - view.R * (cp0 * z - sp * a),
      sp * z + cp0 * a,
    ];
  };

  function drawDisc() {
    dc.clearRect(0, 0, W, H);
    if (R <= 0) return;
    const g = dc.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, col.card);
    g.addColorStop(1, col.faint);
    dc.save();
    dc.shadowColor = col.sh;
    dc.shadowBlur = 24;
    dc.shadowOffsetY = 8;
    dc.beginPath();
    dc.arc(cx, cy, R, 0, 7);
    dc.fillStyle = g;
    dc.fill();
    dc.restore();
    dc.strokeStyle = col.ink;
    dc.lineWidth = 1.2;
    dc.stroke();
  }

  function drawMap() {
    dirty = false;
    setView();
    ctx.clearRect(0, 0, W, H);
    if (R <= 0) return;
    const { cl, sl, sp, cp0 } = view;
    // round joins cost a lot on long paths; bevel avoids the spikes miter leaves on jagged coasts
    ctx.lineJoin = "bevel";

    ctx.beginPath();
    for (const g of grat) traceArc(g, view, ctx, MIN_SEG);
    ctx.strokeStyle = col.line;
    ctx.lineWidth = opts.detail ? 0.6 : 0.7;
    ctx.stroke();

    const [s0, s1, s2] = xyz(...subsolar());
    const day = new Path2D();
    const night = new Path2D();
    const dr = opts.detail ? 0.6 : 0.7;
    for (let i = 0; i < dots.length; i += 3) {
      const x = dots[i]!;
      const y = dots[i + 1]!;
      const z = dots[i + 2]!;
      const a = x * cl + y * sl;
      if (sp * z + cp0 * a < 0.02) continue;
      (x * s0 + y * s1 + z * s2 > 0 ? day : night).rect(
        cx + R * (y * cl - x * sl) - dr,
        cy - R * (cp0 * z - sp * a) - dr,
        dr * 2,
        dr * 2,
      );
    }
    ctx.fillStyle = col.ink;
    ctx.globalAlpha = 0.45;
    ctx.fill(day);
    ctx.globalAlpha = 0.12;
    ctx.fill(night);
    ctx.globalAlpha = 1;

    if (land) {
      ctx.beginPath();
      for (const arc of land) traceArc(arc, view, ctx, MIN_SEG);
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (show.iss && track) {
      ctx.beginPath();
      traceArc(track, view, ctx, MIN_SEG);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = col.red;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const qs = show.quakes ? quakes : [];
    for (const q of qs) {
      const [x, y, c] = P(q.lon, q.lat);
      if (c < 0) continue;
      ctx.beginPath();
      ctx.arc(x, y, quakeR(q), 0, 7);
      ctx.fillStyle = col.quake;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col.quake;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, 7);
      ctx.fillStyle = col.quake;
      ctx.fill();
      ctx.strokeStyle = col.card;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const q of [qHover, qPick]) {
      const m = q && qs.find((x) => sameQuake(x, q));
      if (!m) continue;
      const [x, y, c] = P(m.lon, m.lat);
      if (c < 0) continue;
      const r = quakeR(m) + 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = col.ink;
      ctx.fillText(`M${m.mag.toFixed(1)}`, x + r + 4, y + 4);
    }
    (show.pads ? pads : []).forEach((p, i) => {
      if (p.lat === null || p.lon === null) return;
      const [x, y, c] = P(p.lon, p.lat);
      if (c < 0) return;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 4.5, y + 3.5);
      ctx.lineTo(x - 4.5, y + 3.5);
      ctx.closePath();
      if (i === hi) {
        ctx.fillStyle = col.red;
        ctx.fill();
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = col.ink;
        ctx.fillText(p.location.split(",")[0] ?? "", x + 9, y + 4);
      } else {
        ctx.strokeStyle = col.redt;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    });
  }

  /** Pulses on the strongest quake and the ISS, plus the ISS marker and label */
  function drawFx(t: number) {
    fc.clearRect(0, 0, W, H);
    if (R <= 0) return;
    setView();
    const still = reduce();
    if (show.quakes && topQuake) {
      const [x, y, c] = P(topQuake.lon, topQuake.lat);
      if (c >= 0) {
        const ph = still ? 0.35 : (t / 2200) % 1;
        fc.beginPath();
        fc.arc(x, y, quakeR(topQuake) + 3 + ph * 14, 0, 7);
        fc.strokeStyle = col.quake;
        fc.lineWidth = 1.5;
        fc.globalAlpha = (1 - ph) * 0.8;
        fc.stroke();
        fc.globalAlpha = 1;
      }
    }
    if (show.iss && iss) {
      const [x, y, c] = P(iss.longitude, iss.latitude);
      if (c >= 0) {
        const ph = still ? 0.35 : (t / 1600) % 1;
        fc.beginPath();
        fc.arc(x, y, 5 + ph * 16, 0, 7);
        fc.strokeStyle = `rgba(227,6,19,${(1 - ph) * 0.7})`;
        fc.lineWidth = 1.5;
        fc.stroke();
        fc.beginPath();
        fc.arc(x, y, 4.5, 0, 7);
        fc.fillStyle = col.red;
        fc.fill();
        fc.font = '700 11px "JetBrains Mono", monospace';
        fc.fillStyle = col.ink;
        fc.fillText("ISS", x + 9, y - 7);
      }
    }
  }

  const animating = () => vis && !document.hidden && !reduce();
  const schedule = () => {
    if (!raf && vis && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const invalidate = () => {
    dirty = true;
    schedule();
  };

  function frame(t: number) {
    raf = 0;
    const moving = animating();
    if (moving && !drag && last && t - last < FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = last ? Math.min(100, t - last) : 0;
    last = moving ? t : 0;
    if (!drag && follow && iss) {
      const dl = ((iss.longitude - lon0 + 540) % 360) - 180;
      const da = Math.max(-60, Math.min(60, iss.latitude)) - lat0;
      if (Math.abs(dl) + Math.abs(da) > 0.01) {
        const k = moving ? Math.min(1, dt / 400) : 1;
        lon0 += dl * k;
        lat0 += da * k;
        dirty = true;
      }
    } else if (moving && !drag && !qPick && !paused && dt) {
      lon0 += dt * SPIN;
      dirty = true;
    }
    if (dirty) drawMap();
    drawFx(t);
    if (moving) raf = requestAnimationFrame(frame);
  }

  const gotLand = (res: LandRes) => (l: Land | null) => {
    if (!l || !alive || landHave === "50m") return;
    land = l;
    landHave = res;
    invalidate();
  };
  const wantLand = () => {
    const res = landResFor(R);
    if (landAsked === "50m" || landAsked === res) return;
    // 110m first: it arrives quickly and shows something while 50m loads
    if (!landAsked && res === "50m") void loadLand("110m").then(gotLand("110m"));
    landAsked = res;
    void loadLand(res).then(gotLand(res));
  };
  const size = () => {
    const r = wrap.getBoundingClientRect();
    // the big globe is capped at 1.5x: at 2x it draws 78% more pixels for little visible gain
    const dpr = Math.min(opts.detail ? 1.5 : 2, devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    for (const [c, x] of [
      [discCv, dc],
      [mapCv, ctx],
      [fxCv, fc],
    ] as const) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    R = Math.min(W, H) / 2 - 34;
    cx = W / 2;
    cy = H / 2 - 6;
    readCol();
    wantLand();
    drawDisc();
    drawMap();
    drawFx(performance.now());
  };

  const ro = new ResizeObserver(size);
  ro.observe(wrap);
  const io = new IntersectionObserver((e) => {
    vis = e[0]?.isIntersecting ?? false;
    opts.onVisible?.(vis);
    if (vis) {
      last = 0;
      schedule();
    }
  });
  io.observe(wrap);
  const mo = new MutationObserver(() => {
    readCol();
    drawDisc();
    invalidate();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onVis = () => {
    if (document.hidden) return;
    last = 0;
    schedule();
  };
  document.addEventListener("visibilitychange", onVis);

  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("button, a")) return;
    drag = [e.clientX, e.clientY, lon0, lat0];
    moved = false;
    wrap.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag[0], e.clientY - drag[1]) > 4) moved = true;
    lon0 = drag[2] - (e.clientX - drag[0]) * 0.35;
    lat0 = Math.max(-80, Math.min(80, drag[3] + (e.clientY - drag[1]) * 0.35));
    invalidate();
  };
  const pickAt = (px: number, py: number) => {
    setView();
    let best: Quake | null = null;
    let bd = Infinity;
    for (const q of show.quakes ? quakes : []) {
      const [x, y, c] = P(q.lon, q.lat);
      const d = Math.hypot(x - px, y - py);
      if (c >= 0 && d <= quakeR(q) + 6 && d < bd) {
        best = q;
        bd = d;
      }
    }
    return best;
  };
  const onUp = (e: PointerEvent) => {
    const wasDrag = drag;
    drag = null;
    if (!wasDrag || moved || e.type !== "pointerup" || !opts.onPickQuake) return;
    const b = wrap.getBoundingClientRect();
    const q = pickAt(e.clientX - b.left, e.clientY - b.top);
    if (q) opts.onPickQuake(q);
  };
  wrap.addEventListener("pointerdown", onDown);
  wrap.addEventListener("pointermove", onMove);
  wrap.addEventListener("pointerup", onUp);
  wrap.addEventListener("pointercancel", onUp);

  return {
    setIss(d: IssPosition) {
      iss = d;
      schedule();
    },
    setTrack(pts: IssPosition[]) {
      const out: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = xyz(pts[i]!.longitude, pts[i]!.latitude);
        const b = xyz(pts[i + 1]!.longitude, pts[i + 1]!.latitude);
        for (let k = 0; k < 12; k++) out.push(...slerp(a, b, k / 12));
      }
      const end = pts[pts.length - 1];
      if (end) out.push(...xyz(end.longitude, end.latitude));
      track = out.length > 3 ? Float32Array.from(out) : null;
      invalidate();
    },
    setPads(p: Launch[]) {
      if (p === pads) return;
      pads = p;
      invalidate();
    },
    setQuakes(q: Quake[]) {
      if (q === quakes) return;
      quakes = q;
      topQuake = strongest(q);
      invalidate();
    },
    /** hover highlights a marker; pick also labels it, stops the spin and, with focus, centres it */
    markQuakes(hover: Quake | null, pick: Quake | null, focus: boolean) {
      if (hover === qHover && pick === qPick && !focus) return;
      qHover = hover;
      qPick = pick;
      if (focus && pick) {
        follow = false;
        lon0 = pick.lon;
        lat0 = Math.max(-60, Math.min(60, pick.lat));
      }
      invalidate();
    },
    highlight(i: number, focus: boolean) {
      const p = pads[i];
      const centre = focus && p && p.lat !== null && p.lon !== null;
      if (i === hi && !centre) return;
      hi = i;
      if (centre) {
        follow = false;
        lon0 = p.lon!;
        lat0 = Math.max(-60, Math.min(60, p.lat!));
      }
      invalidate();
    },
    follow(on: boolean) {
      follow = on;
      invalidate();
    },
    setLayers(l: Layers) {
      show = l;
      invalidate();
    },
    pause(on: boolean) {
      paused = on;
    },
    reset() {
      follow = false;
      lon0 = HOME.lon;
      lat0 = HOME.lat;
      invalidate();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      discCv.remove();
      mapCv.remove();
      fxCv.remove();
    },
  };
}

export type Globe = ReturnType<typeof createGlobe>;
