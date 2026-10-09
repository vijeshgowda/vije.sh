/** Geometry for the career timing diagram (prototype `timingSVG`): one clock row, one signal per role. */

export interface Span {
  from: string;
  to: string;
  org: string;
}

export interface TimingLayout {
  width: number;
  height: number;
  top: number;
  years: { year: number; x: number }[];
  clock: string;
  signals: { label: string; labelY: number; d: string }[];
  nowX: number;
}

const W = 800;
const L = 170;
const R = 780;
const TOP = 34;
const ROW = 44;

/** Fractional calendar year in UTC, e.g. 1 Jul 2026 is about 2026.5. */
export function yearFraction(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (ms - start) / (Date.UTC(y + 1, 0, 1) - start);
}

export function timingLayout(spans: readonly Span[], nowYear: number): TimingLayout {
  const end = (s: Span) => (s.to === "now" ? nowYear : Number(s.to));
  const y0 = Math.min(...spans.map((s) => Number(s.from)));
  const y1 = Math.max(Math.floor(nowYear) + 1, ...spans.map((s) => Math.ceil(end(s))));
  const X = (y: number) => +(L + ((y - y0) / (y1 - y0)) * (R - L)).toFixed(1);
  const r = (n: number) => +n.toFixed(1);

  const years = [];
  let clock = `M${L} ${TOP + 32}`;
  for (let y = y0; y <= y1; y++) {
    years.push({ year: y, x: X(y) });
    if (y < y1)
      clock += ` L${X(y)} ${TOP + 14} L${X(y + 0.5)} ${TOP + 14} L${X(y + 0.5)} ${TOP + 32} L${X(y + 1)} ${TOP + 32}`;
  }

  const signals = spans.map((s, i) => {
    const yb = TOP + ROW * (i + 1) + 32;
    const a = X(Number(s.from));
    const b = X(end(s));
    return {
      label: s.org.toUpperCase(),
      labelY: yb - 5,
      d: `M${L} ${yb} H${r(a - 3)} L${r(a + 3)} ${yb - 20} H${r(b - 3)} L${r(b + 3)} ${yb} H${R}`,
    };
  });

  return {
    width: W,
    height: TOP + (spans.length + 1) * ROW + 8,
    top: TOP,
    years,
    clock,
    signals,
    nowX: X(nowYear),
  };
}
