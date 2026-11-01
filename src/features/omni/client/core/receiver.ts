import { decrypt, IncrementalSHA256 } from "./crypto";
import { receivedFile, type PreviewKind } from "./files";
import { CHUNK_SIZE, decodeFileFrame, type FileMetadata } from "./protocol";

/** A peer can't make us hold more than this many half-received files at once. */
export const MAX_INCOMING = 16;

export type ReceiveResult =
  | { type: "progress"; fileId: number; received: number; total: number }
  | {
      type: "complete";
      fileId: number;
      meta: FileMetadata;
      blob: Blob;
      name: string;
      preview: PreviewKind | null;
    }
  | { type: "failed"; fileId: number; meta: FileMetadata; reason: "integrity" | "corrupt" };

type Incoming = {
  meta: FileMetadata;
  parts: (Uint8Array<ArrayBuffer> | undefined)[];
  received: number;
  /** Chunks are hashed in index order as soon as each one's predecessors have arrived. */
  hashed: number;
  hash: IncrementalSHA256;
};

/**
 * Reassembles encrypted transfers from `file-meta` messages and binary frames. Several files can be
 * interleaved; each frame's file ID picks its transfer. The result is always a download-only blob.
 */
export class FileReceiver {
  private transfers = new Map<number, Incoming>();

  constructor(private readonly key: () => CryptoKey | null) {}

  get active() {
    return this.transfers.size;
  }

  /** Registers an announced file. Empty files complete immediately. */
  begin(meta: FileMetadata): ReceiveResult | null {
    if (this.transfers.has(meta.fileId)) throw new Error("Duplicate file transfer ID");
    if (this.transfers.size >= MAX_INCOMING) throw new Error("Too many files at once");
    const incoming: Incoming = {
      meta,
      parts: new Array<Uint8Array<ArrayBuffer> | undefined>(meta.chunks),
      received: 0,
      hashed: 0,
      hash: new IncrementalSHA256(),
    };
    this.transfers.set(meta.fileId, incoming);
    return meta.chunks === 0 ? this.finish(incoming) : null;
  }

  /** Decrypts one frame. Frames for unknown (finished, failed or cleared) transfers are ignored. */
  async chunk(frame: ArrayBuffer): Promise<ReceiveResult | null> {
    const { fileId, chunkIndex, encrypted } = decodeFileFrame(frame);
    const incoming = this.transfers.get(fileId);
    if (!incoming) return null;
    const { meta } = incoming;
    if (chunkIndex >= meta.chunks || incoming.parts[chunkIndex]) return this.fail(incoming);
    const key = this.key();
    if (!key) throw new Error("File chunk received before key exchange");
    let plain: Uint8Array<ArrayBuffer>;
    try {
      plain = new Uint8Array(await decrypt(key, encrypted));
    } catch {
      return this.transfers.get(fileId) === incoming ? this.fail(incoming) : null;
    }
    if (this.transfers.get(fileId) !== incoming || incoming.parts[chunkIndex]) return null;
    const expected =
      chunkIndex < meta.chunks - 1 ? CHUNK_SIZE : meta.size - (meta.chunks - 1) * CHUNK_SIZE;
    if (plain.byteLength !== expected) return this.fail(incoming);
    incoming.parts[chunkIndex] = plain;
    incoming.received++;
    for (let part = incoming.parts[incoming.hashed]; part; part = incoming.parts[incoming.hashed]) {
      incoming.hash.update(part);
      incoming.hashed++;
    }
    if (incoming.hashed === meta.chunks) return this.finish(incoming);
    return { type: "progress", fileId, received: incoming.received, total: meta.chunks };
  }

  clear() {
    this.transfers.clear();
  }

  private finish(incoming: Incoming): ReceiveResult {
    const { meta } = incoming;
    this.transfers.delete(meta.fileId);
    if (incoming.hash.digest() !== meta.hash) {
      return { type: "failed", fileId: meta.fileId, meta, reason: "integrity" };
    }
    const file = receivedFile(incoming.parts as BlobPart[], meta.name, meta.mimeType);
    return { type: "complete", fileId: meta.fileId, meta, ...file };
  }

  private fail(incoming: Incoming): ReceiveResult {
    this.transfers.delete(incoming.meta.fileId);
    return { type: "failed", fileId: incoming.meta.fileId, meta: incoming.meta, reason: "corrupt" };
  }
}
