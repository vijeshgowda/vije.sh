import { z } from "zod";

export const CHUNK_SIZE = 64 * 1024;
export const BUFFER_HIGH = 16 * 1024 * 1024;
export const BUFFER_LOW = 4 * 1024 * 1024;
const uint32 = z.number().int().min(0).max(0xffffffff);
const code = z.string().regex(/^[A-Z0-9]{4,10}$/);

const descriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});
const candidateSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});
export const signalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("description"), sdp: descriptionSchema }),
  z.object({ type: z.literal("ice-candidate"), candidate: candidateSchema }),
]);
export type Signal = z.infer<typeof signalSchema>;

export const signalingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("created"), code, custom: z.boolean() }),
  z.object({ type: z.literal("joined"), code }),
  z.object({ type: z.literal("rejoined"), code, custom: z.boolean() }),
  z.object({ type: z.literal("rejoin-failed"), code }),
  z.object({ type: z.literal("peer-joined") }),
  z.object({ type: z.literal("peer-left") }),
  z.object({ type: z.literal("signal"), payload: signalSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type SignalingMessage = z.infer<typeof signalingMessageSchema>;
export type SignalingRequest =
  { type: "create" | "join" | "rejoin"; code: string } | { type: "signal"; payload: Signal };

export const fileMetadataSchema = z
  .object({
    type: z.literal("file-meta"),
    fileId: uint32,
    name: z.string(),
    size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    mimeType: z.string(),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    chunks: z.number().int().min(0),
  })
  .refine((meta) => meta.chunks === Math.ceil(meta.size / CHUNK_SIZE), {
    message: "File size and chunk count disagree",
  });
export type FileMetadata = z.infer<typeof fileMetadataSchema>;

export const dataMessageSchema = z.union([
  z.object({ type: z.literal("chat"), text: z.string() }),
  fileMetadataSchema,
  z.object({ type: z.literal("typing") }),
  z.object({ type: z.literal("__verify") }),
  z.object({ type: z.literal("__verified") }),
]);
export type DataMessage = z.infer<typeof dataMessageSchema>;
export const channelMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pubkey"), key: z.string() }),
  z.object({ type: z.literal("encrypted"), data: z.string() }),
]);

export function encodeFileFrame(
  fileId: number,
  chunkIndex: number,
  encrypted: Uint8Array,
): ArrayBuffer {
  uint32.parse(fileId);
  uint32.parse(chunkIndex);
  if (encrypted.byteLength < 28 || encrypted.byteLength > CHUNK_SIZE + 28) {
    throw new Error("Invalid encrypted file chunk length");
  }
  const frame = new Uint8Array(8 + encrypted.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, fileId, true);
  view.setUint32(4, chunkIndex, true);
  frame.set(encrypted, 8);
  return frame.buffer;
}

export function decodeFileFrame(frame: ArrayBuffer) {
  if (frame.byteLength < 36 || frame.byteLength > CHUNK_SIZE + 36) {
    throw new Error("Invalid file frame length");
  }
  const view = new DataView(frame);
  return {
    fileId: view.getUint32(0, true),
    chunkIndex: view.getUint32(4, true),
    encrypted: new Uint8Array(frame.slice(8)),
  };
}
