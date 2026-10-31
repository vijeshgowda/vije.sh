import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  decodeFileFrame,
  encodeFileFrame,
  dataMessageSchema,
  channelMessageSchema,
  signalingMessageSchema,
} from "./protocol";
import golden from "./fixtures/golden.json";

describe("Omni wire schemas and frames", () => {
  it("preserves all original data message shapes", () => {
    for (const { message, wire } of golden.messages) {
      expect(dataMessageSchema.parse(message)).toEqual(message);
      expect(channelMessageSchema.parse(JSON.parse(wire)).type).toBe("encrypted");
    }
    expect(dataMessageSchema.parse(golden.file.metadata)).toEqual(golden.file.metadata);
    expect(channelMessageSchema.parse({ type: "pubkey", key: golden.publicKeys[0] })).toEqual({
      type: "pubkey",
      key: golden.publicKeys[0],
    });
  });

  it("reads and writes unsigned little-endian file IDs and chunk indices", () => {
    const encrypted = new Uint8Array(CHUNK_SIZE + 28).fill(123);
    const encoded = encodeFileFrame(0xabcdef01, 0x12345678, encrypted);
    expect(Array.from(new Uint8Array(encoded.slice(0, 8)))).toEqual([
      1, 239, 205, 171, 120, 86, 52, 18,
    ]);
    expect(decodeFileFrame(encoded)).toEqual({
      fileId: 0xabcdef01,
      chunkIndex: 0x12345678,
      encrypted,
    });
    expect(encoded.byteLength).toBe(65536 + 8 + 12 + 16);
  });

  it.each([0, 8, 35, CHUNK_SIZE + 37])("rejects invalid %i-byte binary frames", (length) => {
    expect(() => decodeFileFrame(new ArrayBuffer(length))).toThrow("frame length");
  });

  it("rejects invalid IDs, ciphertext lengths, metadata and unknown message types", () => {
    expect(() => encodeFileFrame(-1, 0, new Uint8Array(28))).toThrow();
    expect(() => encodeFileFrame(0, 0x100000000, new Uint8Array(28))).toThrow();
    expect(() => encodeFileFrame(0, 0, new Uint8Array(27))).toThrow("chunk length");
    expect(() => encodeFileFrame(0, 0, new Uint8Array(CHUNK_SIZE + 29))).toThrow("chunk length");
    for (const patch of [{ chunks: 1 }, { size: -1 }, { hash: "x" }, { fileId: 1.5 }]) {
      expect(dataMessageSchema.safeParse({ ...golden.file.metadata, ...patch }).success).toBe(
        false,
      );
    }
    expect(dataMessageSchema.safeParse({ type: "html", text: "<script>" }).success).toBe(false);
    expect(
      signalingMessageSchema.safeParse({ type: "created", code: "BAD", custom: false }).success,
    ).toBe(false);
  });
});
