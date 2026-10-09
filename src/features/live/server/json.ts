/** Loose readers for untrusted upstream JSON: every value is coerced, nothing is trusted as-is. */
export type Json = unknown;

export const obj = (v: Json): Record<string, Json> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : {};
export const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
export const str = (v: Json, d = ""): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : d;
export const num = (v: Json, d = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
export const numOrNull = (v: Json): number | null => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
/** Walks a path, e.g. get(x, "pad", "location", "name") or get(x, "people", 0) */
export const get = (v: Json, ...path: (string | number)[]): Json =>
  path.reduce<Json>((acc, k) => (typeof k === "number" ? arr(acc)[k] : obj(acc)[k]), v);
