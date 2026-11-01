import { beforeAll, describe, expect, it } from "vitest";
import { encrypt, sha256 } from "./crypto";
import { CHUNK_SIZE, encodeFileFrame, type FileMetadata } from "./protocol";
import { FileReceiver, MAX_INCOMING } from "./receiver";

let key: CryptoKey;
let otherKey: CryptoKey;
const aes = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

beforeAll(async () => {
  key = await aes();
  otherKey = await aes();
});

function bytes(size: number, seed = 1) {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31 + seed) & 0xff);
}

async function meta(
  data: Uint8Array,
  overrides: Partial<FileMetadata> = {},
): Promise<FileMetadata> {
  return {
    type: "file-meta",
    fileId: 7,
    name: "../photo.png",
    size: data.byteLength,
    mimeType: "image/png",
    hash: await sha256(data),
    chunks: Math.ceil(data.byteLength / CHUNK_SIZE),
    ...overrides,
  };
}

async function frames(data: Uint8Array, fileId = 7, sealKey = key) {
  const out: ArrayBuffer[] = [];
  for (let index = 0; index * CHUNK_SIZE < data.byteLength; index++) {
    const chunk = data.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    out.push(encodeFileFrame(fileId, index, await encrypt(sealKey, chunk)));
  }
  return out;
}

describe("FileReceiver", () => {
  it("reassembles out-of-order chunks into a verified download-only blob", async () => {
    const data = bytes(CHUNK_SIZE * 2 + 100);
    const receiver = new FileReceiver(() => key);
    expect(receiver.begin(await meta(data))).toBeNull();
    const [a, b, c] = await frames(data);
    expect(await receiver.chunk(c!)).toEqual({
      type: "progress",
      fileId: 7,
      received: 1,
      total: 3,
    });
    expect(await receiver.chunk(a!)).toMatchObject({ type: "progress", received: 2 });
    const done = await receiver.chunk(b!);
    expect(done).toMatchObject({
      type: "complete",
      fileId: 7,
      name: "photo.png",
      preview: "image",
    });
    if (done?.type !== "complete") throw new Error("expected completion");
    expect(done.blob.type).toBe("application/octet-stream");
    expect(new Uint8Array(await done.blob.arrayBuffer())).toEqual(data);
    expect(receiver.active).toBe(0);
  });

  it("demultiplexes interleaved transfers and ignores unknown file IDs", async () => {
    const first = bytes(CHUNK_SIZE + 1, 1);
    const second = bytes(10, 2);
    const receiver = new FileReceiver(() => key);
    receiver.begin(await meta(first, { fileId: 1, mimeType: "image/svg+xml" }));
    receiver.begin(await meta(second, { fileId: 2 }));
    const [f1a, f1b] = await frames(first, 1);
    const [f2] = await frames(second, 2);
    expect(await receiver.chunk((await frames(second, 99))[0]!)).toBeNull();
    await receiver.chunk(f1a!);
    expect(await receiver.chunk(f2!)).toMatchObject({ type: "complete", fileId: 2 });
    expect(await receiver.chunk(f1b!)).toMatchObject({
      type: "complete",
      fileId: 1,
      preview: null,
    });
  });

  it("completes empty files at once", async () => {
    const receiver = new FileReceiver(() => key);
    const result = receiver.begin(await meta(new Uint8Array(0)));
    expect(result).toMatchObject({ type: "complete", fileId: 7 });
  });

  it("fails a transfer whose content doesn't match the announced hash", async () => {
    const data = bytes(50);
    const receiver = new FileReceiver(() => key);
    receiver.begin(await meta(data, { hash: "0".repeat(64) }));
    const [frame] = await frames(data);
    expect(await receiver.chunk(frame!)).toMatchObject({ type: "failed", reason: "integrity" });
    expect(receiver.active).toBe(0);
  });

  it.each([
    ["undecryptable", async (data: Uint8Array) => (await frames(data, 7, otherKey))[0]!],
    ["out of range", async (data: Uint8Array) => encodeFileFrame(7, 5, await encrypt(key, data))],
    ["the wrong length", async () => encodeFileFrame(7, 0, await encrypt(key, bytes(3)))],
  ])("fails a corrupt transfer: %s chunk", async (_, make) => {
    const data = bytes(50);
    const receiver = new FileReceiver(() => key);
    receiver.begin(await meta(data));
    expect(await receiver.chunk(await make(data))).toMatchObject({
      type: "failed",
      reason: "corrupt",
    });
    // later frames for the failed transfer are ignored
    expect(await receiver.chunk((await frames(data))[0]!)).toBeNull();
  });

  it("fails on a repeated chunk", async () => {
    const data = bytes(CHUNK_SIZE + 5);
    const receiver = new FileReceiver(() => key);
    receiver.begin(await meta(data));
    const [first] = await frames(data);
    await receiver.chunk(first!);
    expect(await receiver.chunk(first!)).toMatchObject({ type: "failed", reason: "corrupt" });
  });

  it("rejects duplicate IDs, too many transfers and chunks before the key", async () => {
    const data = bytes(5);
    const receiver = new FileReceiver(() => null);
    receiver.begin(await meta(data));
    await expect(async () => receiver.begin(await meta(data))).rejects.toThrow(/Duplicate/);
    await expect(receiver.chunk((await frames(data))[0]!)).rejects.toThrow(/before key/);
    for (let id = 100; receiver.active < MAX_INCOMING; id++) {
      receiver.begin(await meta(data, { fileId: id }));
    }
    await expect(async () => receiver.begin(await meta(data, { fileId: 1 }))).rejects.toThrow(
      /Too many/,
    );
    receiver.clear();
    expect(receiver.active).toBe(0);
  });
});
