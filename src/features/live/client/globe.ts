/**
 * Orthographic canvas globe for LF-01: coastlines (TopoJSON), day/night dots, ISS + ground track,
 * launch pads and earthquake rings. Plain DOM/canvas, no React; IssFeed owns its lifecycle.
 */
import type { Launch, Quake } from "../types";

const RAD = Math.PI / 180;
type LonLat = [number, number];
type Vec3 = [number, number, number];

let landArcs: LonLat[][] | null = null;
let landReq: Promise<LonLat[][] | null> | null = null;

/** Coastlines, self-hosted (public/data/land-110m.json, world-atlas@2, ISC) */
export function loadLand(): Promise<LonLat[][] | null> {
  landReq ??= fetch("/data/land-110m.json")
    .then((r) => r.json())
    .then((t: { transform: { scale: LonLat; translate: LonLat }; arcs: LonLat[][] }) => {
      const [sx, sy] = t.transform.scale;
      const [tx, ty] = t.transform.translate;
      landArcs = t.arcs.map((a) => {
        let x = 0;
        let y = 0;
        return a.map(([dx, dy]): LonLat => {
          x += dx;
          y += dy;
          return [x * sx + tx, y * sy + ty];
        });
      });
      return landArcs;
    })
    .catch(() => {
      landReq = null;
      return null;
    });
  return landReq;
}

const DOTS: LonLat[] = [];
for (let la = -84; la <= 84; la += 4) {
  const n = Math.max(1, Math.round(90 * Math.cos(la * RAD)));
  for (let k = 0; k < n; k++) DOTS.push([(k / n) * 360 - 180, la]);
}

export const xyz = (lon: number, lat: number): Vec3 => [
  Math.cos(lat * RAD) * Math.cos(lon * RAD),
  Math.cos(lat * RAD) * Math.sin(lon * RAD),
  Math.sin(lat * RAD),
];
export const toLL = ([x, y, z]: Vec3): LonLat => [
  Math.atan2(y, x) / RAD,
  Math.asin(Math.max(-1, Math.min(1, z))) / RAD,
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

export function createGlobe(wrap: HTMLElement, opts: { reduceMotion: () => boolean }) {
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  wrap.prepend(cv);
  const ctx = cv.getContext("2d")!;
  let W = 0;
  let H = 0;
  let R = 0;
  let cx = 0;
  let cy = 0;
  let lon0 = -40;
  let lat0 = 22;
  let drag: [number, number, number, number] | null = null;
  let follow = false;
  let raf = 0;
  let vis = true;
  let last = 0;
  let col = { ink: "", line: "", card: "", faint: "", red: "#e30613", redt: "", sh: "" };
  let iss: IssPosition | null = null;
  let track: LonLat[] = [];
  let pads: Launch[] = [];
  let hi = -1;
  let quakes: Quake[] = [];
  const reduce = opts.reduceMotion;

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
      sh: `rgb(${v("--sc")} / ${dark ? 0.7 : 0.3})`,
    };
  };
  const P = (lon: number, lat: number): Vec3 => {
    const l = (lon - lon0) * RAD;
    const p = lat * RAD;
    const p0 = lat0 * RAD;
    const cp = Math.cos(p);
    return [
      cx + R * cp * Math.sin(l),
      cy - R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l)),
      Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l),
    ];
  };
  const line = (pts: LonLat[]) => {
    let on = false;
    for (const [lo, la] of pts) {
      const [x, y, c] = P(lo, la);
      if (c < 0) {
        on = false;
        continue;
      }
      if (on) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      on = true;
    }
  };

  function draw(t = performance.now()) {
    if (R <= 0) return;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, col.card);
    g.addColorStop(1, col.faint);
    ctx.save();
    ctx.shadowColor = col.sh;
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = col.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    for (let lo = -180; lo < 180; lo += 30)
      line(Array.from({ length: 61 }, (_, k): LonLat => [lo, -90 + k * 3]));
    for (let la = -60; la <= 60; la += 30)
      line(Array.from({ length: 121 }, (_, k): LonLat => [-180 + k * 3, la]));
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    const sv = xyz(...subsolar());
    const day = new Path2D();
    const night = new Path2D();
    for (const [lo, la] of DOTS) {
      const [x, y, c] = P(lo, la);
      if (c < 0.02) continue;
      const v = xyz(lo, la);
      (v[0] * sv[0] + v[1] * sv[1] + v[2] * sv[2] > 0 ? day : night).rect(
        x - 0.7,
        y - 0.7,
        1.4,
        1.4,
      );
    }
    ctx.fillStyle = col.ink;
    ctx.globalAlpha = 0.45;
    ctx.fill(day);
    ctx.globalAlpha = 0.12;
    ctx.fill(night);
    ctx.globalAlpha = 1;

    if (landArcs) {
      ctx.beginPath();
      landArcs.forEach(line);
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (track.length > 1) {
      ctx.beginPath();
      line(track);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = col.red;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const q of quakes) {
      const [x, y, c] = P(q.lon, q.lat);
      if (c < 0) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2 + Math.max(0, q.mag - 4.5) * 3, 0, 7);
      ctx.strokeStyle = col.ink;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    pads.forEach((p, i) => {
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
    if (iss) {
      const [x, y, c] = P(iss.longitude, iss.latitude);
      if (c >= 0) {
        const ph = (t / 1600) % 1;
        ctx.beginPath();
        ctx.arc(x, y, 5 + ph * 16, 0, 7);
        ctx.strokeStyle = `rgba(227,6,19,${(1 - ph) * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, 7);
        ctx.fillStyle = col.red;
        ctx.fill();
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.fillStyle = col.ink;
        ctx.fillText("ISS", x + 9, y - 7);
      }
    }
  }

  function frame(t: number) {
    raf = 0;
    const dt = Math.min(50, t - (last || t));
    last = t;
    if (!drag) {
      if (follow && iss) {
        lon0 += (((iss.longitude - lon0 + 540) % 360) - 180) * Math.min(1, dt / 400);
        lat0 += (Math.max(-60, Math.min(60, iss.latitude)) - lat0) * Math.min(1, dt / 400);
      } else if (!reduce()) lon0 += dt * 0.004;
    }
    draw(t);
    if (vis && !document.hidden && !reduce()) raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    if (reduce()) draw();
    else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  const size = () => {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) / 2 - 34;
    cx = W / 2;
    cy = H / 2 - 6;
    readCol();
    draw();
  };

  const ro = new ResizeObserver(size);
  ro.observe(wrap);
  const io = new IntersectionObserver((e) => {
    vis = e[0]?.isIntersecting ?? false;
    if (vis) kick();
  });
  io.observe(wrap);
  const mo = new MutationObserver(() => {
    readCol();
    draw();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onVis = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener("visibilitychange", onVis);

  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    drag = [e.clientX, e.clientY, lon0, lat0];
    wrap.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    lon0 = drag[2] - (e.clientX - drag[0]) * 0.35;
    lat0 = Math.max(-80, Math.min(80, drag[3] + (e.clientY - drag[1]) * 0.35));
    if (reduce()) draw();
  };
  const onUp = () => {
    drag = null;
  };
  wrap.addEventListener("pointerdown", onDown);
  wrap.addEventListener("pointermove", onMove);
  wrap.addEventListener("pointerup", onUp);
  wrap.addEventListener("pointercancel", onUp);

  return {
    setIss(d: IssPosition) {
      iss = d;
      if (reduce()) draw();
    },
    setTrack(pts: IssPosition[]) {
      const out: LonLat[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = xyz(pts[i]!.longitude, pts[i]!.latitude);
        const b = xyz(pts[i + 1]!.longitude, pts[i + 1]!.latitude);
        for (let k = 0; k < 12; k++) out.push(toLL(slerp(a, b, k / 12)));
      }
      const end = pts[pts.length - 1];
      if (end) out.push([end.longitude, end.latitude]);
      track = out;
      if (reduce()) draw();
    },
    setPads(p: Launch[]) {
      pads = p;
      draw();
    },
    setQuakes(q: Quake[]) {
      quakes = q;
      draw();
    },
    highlight(i: number, focus: boolean) {
      hi = i;
      const p = pads[i];
      if (focus && p && p.lat !== null && p.lon !== null) {
        follow = false;
        lon0 = p.lon;
        lat0 = Math.max(-60, Math.min(60, p.lat));
      }
      draw();
    },
    follow(on: boolean) {
      follow = on;
      kick();
    },
    redraw: () => draw(),
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
      cv.remove();
    },
  };
}

export type Globe = ReturnType<typeof createGlobe>;
