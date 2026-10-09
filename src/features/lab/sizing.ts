/** Memory sizing for model weights (prototype `V.lab`): M_GB = P_B × b ÷ 8, raw weights only. */

export const BITS = [16, 8, 4, 2, 1.58, 1] as const;
export type Bits = (typeof BITS)[number];

export const PARAMS = { min: 1, max: 120 } as const;

/** Memory targets the model is checked against, in GB. */
export const FITS: readonly { name: string; gb: number }[] = [
  { name: "ESP32-C3 (400 KB)", gb: 0.0004 },
  { name: "8 GB laptop", gb: 8 },
  { name: "12 GB GPU", gb: 12 },
  { name: "16 GB GPU", gb: 16 },
  { name: "24 GB GPU", gb: 24 },
  { name: "32 GB GPU", gb: 32 },
  { name: "64 GB workstation", gb: 64 },
];

export interface LabState {
  /** Parameters, in billions */
  p: number;
  b: Bits;
}

export const DEFAULT_LAB: LabState = { p: 27, b: 1.58 };

export const gigabytes = (params: number, bits: number) => (params * bits) / 8;

/** One decimal under 10 GB, whole numbers above. */
export const formatGb = (gb: number) => (gb < 10 ? gb.toFixed(1) : String(Math.round(gb)));

export function sizing(params: number, bits: Bits) {
  const gb = gigabytes(params, bits);
  const full = gigabytes(params, 16);
  const ratio = full / gb;
  const note =
    bits === 16
      ? "This is the standard 16-bit size."
      : `Standard 16-bit would be ${full.toFixed(0)} GB, about ${ratio.toFixed(1)}× larger.`;
  return { gb, full, ratio, note };
}

/** How much of register cell `k` (bit k of a 16-bit word) a `bits`-wide weight fills, 0..1. */
export const cellFill = (bits: number, k: number) => Math.max(0, Math.min(1, bits - k));

export const bitsLabel = (b: Bits) => (b === 1.58 ? "1.58 ternary" : String(b));

/** Stored state comes from localStorage: anything unexpected falls back to the default. */
export function parseLab(v: unknown): LabState {
  if (typeof v !== "object" || v === null) return DEFAULT_LAB;
  const { p, b } = v as Record<string, unknown>;
  const okP = typeof p === "number" && Number.isInteger(p) && p >= PARAMS.min && p <= PARAMS.max;
  const okB = BITS.includes(b as Bits);
  return okP && okB ? { p, b: b as Bits } : DEFAULT_LAB;
}
