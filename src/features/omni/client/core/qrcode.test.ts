import { describe, expect, it } from "vitest";
import { makeQrMatrix, makeQrPath, type ErrorCorrectionName } from "./qrcode";
import { sha256 } from "./crypto";
import golden from "./fixtures/golden.json";

function ecc(value: string): ErrorCorrectionName {
  if (value !== "LOW" && value !== "MEDIUM" && value !== "QUARTILE" && value !== "HIGH") {
    throw new Error("Invalid fixture ECC");
  }
  return value;
}

describe("original QR byte-mode encoder", () => {
  it.each(golden.qrs)("matches original matrix for $ecc, size $size", async (vector) => {
    const matrix = makeQrMatrix(vector.text, ecc(vector.ecc));
    expect(matrix.length).toBe(vector.size);
    expect(await sha256(Uint8Array.from(matrix.flat(), Number))).toBe(vector.sha256);
  });
  it("has square, odd-sized modules and finder patterns in three corners", () => {
    const matrix = makeQrMatrix("hello");
    const size = matrix.length;
    expect((size - 17) % 4).toBe(0);
    expect(matrix.every((row) => row.length === size)).toBe(true);
    for (const [x, y] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]) {
      expect(matrix[y][x]).toBe(true);
      expect(matrix[y + 1][x + 1]).toBe(false);
      expect(matrix[y + 3][x + 3]).toBe(true);
    }
  });
  it("returns only safe SVG path geometry with a four-module quiet zone", () => {
    const result = makeQrPath("<script>alert(1)</script>");
    expect(result.dimension).toBe(makeQrMatrix("<script>alert(1)</script>").length + 8);
    expect(result.path).toMatch(/^(M\d+,\d+h1v1h-1z)+$/);
    expect(result.path).not.toContain("script");
    expect(makeQrPath("hello", { border: 0, ecc: "LOW" }).dimension).toBe(21);
  });
  it("rejects oversized data and invalid borders", () => {
    expect(() => makeQrMatrix("x".repeat(4000))).toThrow("too long");
    for (const border of [-1, 0.5, 101])
      expect(() => makeQrPath("hello", { border })).toThrow("border");
  });
});
