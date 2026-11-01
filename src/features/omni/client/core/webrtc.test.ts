import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerConnection } from "./webrtc";
import * as cryptography from "./crypto";
import {
  base64ToUint8,
  decrypt,
  deriveSharedKey,
  encrypt,
  importPublicKey,
  sha256,
  uint8ToBase64,
} from "./crypto";
import {
  BUFFER_HIGH,
  BUFFER_LOW,
  CHUNK_SIZE,
  dataMessageSchema,
  decodeFileFrame,
  encodeFileFrame,
} from "./protocol";
import golden from "./fixtures/golden.json";

class Channel extends EventTarget {
  readyState: RTCDataChannelState = "open";
  binaryType = "blob";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  frames: (string | ArrayBuffer)[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string | ArrayBuffer) {
    if (this.readyState !== "open") throw new Error("Channel closed");
    this.frames.push(data);
  }
  close = vi.fn(() => {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
    this.onclose?.();
  });
  message(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

class Track {
  enabled = true;
  stop = vi.fn();
  constructor(readonly kind: "audio" | "video") {}
}
class Stream {
  static instances: Stream[] = [];
  tracks = [new Track("audio"), new Track("video")];
  constructor() {
    Stream.instances.push(this);
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class Rtc {
  static instances: Rtc[] = [];
  channel = new Channel();
  signalingState: RTCSignalingState = "stable";
  iceConnectionState: RTCIceConnectionState = "new";
  connectionState: RTCPeerConnectionState = "new";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: { type: RTCSdpType; sdp: string; toJSON(): RTCSessionDescriptionInit } | null =
    null;
  onnegotiationneeded: (() => Promise<void>) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate:
    ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  ondatachannel: ((event: { channel: Channel }) => void) | null = null;
  addTrack = vi.fn();
  restartIce = vi.fn();
  addIceCandidate = vi.fn(async (_candidate: RTCIceCandidateInit) => {});
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
    this.signalingState = "stable";
  });
  setLocalDescription = vi.fn(async () => {
    const type = this.remoteDescription?.type === "offer" ? "answer" : "offer";
    this.localDescription = { type, sdp: "v=0", toJSON: () => ({ type, sdp: "v=0" }) };
  });
  parameters: RTCRtpSendParameters = {
    transactionId: "test",
    codecs: [],
    headerExtensions: [],
    encodings: [],
    rtcp: {},
  };
  sender = {
    track: { kind: "video" },
    getParameters: () => this.parameters,
    setParameters: vi.fn(async (parameters: RTCRtpSendParameters) => {
      this.parameters = parameters;
    }),
    replaceTrack: vi.fn(async (_track: MediaStreamTrack | null) => {}),
  };
  getSenders = vi.fn(() => [this.sender]);
  createDataChannel = vi.fn(() => this.channel);
  close = vi.fn(() => {
    this.signalingState = "closed";
  });
  constructor() {
    Rtc.instances.push(this);
  }
}

const peers: PeerConnection[] = [];
beforeEach(() => {
  Rtc.instances = [];
  Stream.instances = [];
  vi.stubGlobal("RTCPeerConnection", Rtc);
  vi.stubGlobal("MediaStream", Stream);
});
afterEach(() => {
  for (const peer of peers.splice(0)) peer.hangup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function fixtureKey() {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    golden.privateKeys[0],
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  return deriveSharedKey(privateKey, await importPublicKey(golden.publicKeys[1]));
}
function fixedIv(iv: number[]) {
  vi.spyOn(crypto, "getRandomValues").mockImplementationOnce((view) => {
    if (!(view instanceof Uint8Array)) throw new Error("Expected IV");
    view.set(iv);
    return view;
  });
}
function newPeer(initiator = true, password = "") {
  const signaling = { sendSignal: vi.fn() };
  const peer = new PeerConnection(signaling, initiator, [], password);
  peers.push(peer);
  return { peer, signaling };
}
async function setup(initiator = true) {
  const { peer, signaling } = newPeer(initiator);
  const stream = new MediaStream();
  await peer.initialize(stream);
  const rtc = Rtc.instances.at(-1)!;
  if (!initiator) rtc.ondatachannel?.({ channel: rtc.channel });
  await vi.waitFor(() => expect(rtc.channel.frames.length).toBe(1));
  return { peer, signaling, rtc, channel: rtc.channel, stream };
}
function stringFrame(value: string | ArrayBuffer): string {
  if (typeof value !== "string") throw new Error("Expected text frame");
  return value;
}
function binaryFrame(value: string | ArrayBuffer): ArrayBuffer {
  if (!(value instanceof ArrayBuffer)) throw new Error("Expected binary frame");
  return value;
}

describe("data channel and golden wire compatibility", () => {
  it("sends exactly the original public-key wrapper with a synthetic fixture key pair", async () => {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      golden.privateKeys[0],
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    vi.spyOn(cryptography, "generateKeyPair").mockResolvedValueOnce({
      privateKey,
      publicKey: await importPublicKey(golden.publicKeys[0]),
    });
    const { channel } = await setup();
    expect(channel.frames).toEqual([golden.publicKeyWire]);
  });
  it.each(golden.messages)(
    "sends exactly the original encrypted $message.type message",
    async (vector) => {
      const { peer, channel } = await setup();
      peer.sharedKey = await fixtureKey();
      channel.frames = [];
      fixedIv(vector.iv);
      await peer.send(dataMessageSchema.parse(vector.message));
      expect(channel.frames).toEqual([vector.wire]);
    },
  );

  it("sends the original file metadata and two exact LE/IV/ciphertext/tag frames at 64 KB", async () => {
    const { peer, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    channel.frames = [];
    const data = Uint8Array.from(
      { length: golden.file.metadata.size },
      (_, i) => (i * 3 + 1) & 255,
    );
    const ivs = [golden.file.metadataIv, ...golden.file.frames.map((frame) => frame.iv)];
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((view) => {
      if (!(view instanceof Uint8Array)) throw new Error("Expected IV");
      const iv = ivs.shift();
      if (!iv) throw new Error("Unexpected IV request");
      view.set(iv);
      return view;
    });
    const progress = vi.fn();
    peer.on("file-send-progress", progress);
    await peer.sendFile(new File([data], "sample.bin", { type: "application/octet-stream" }), {
      fileId: golden.file.metadata.fileId,
    });
    random.mockRestore();
    expect(channel.frames[0]).toBe(golden.file.metadataWire);
    for (let i = 0; i < golden.file.frames.length; i++) {
      const frame = binaryFrame(channel.frames[i + 1]),
        expected = golden.file.frames[i];
      expect(frame.byteLength).toBe(expected.byteLength);
      expect(Array.from(new Uint8Array(frame.slice(0, 8)))).toEqual(expected.header);
      expect(await sha256(frame)).toBe(expected.sha256);
      const decoded = decodeFileFrame(frame);
      expect(decoded.fileId).toBe(golden.file.metadata.fileId);
      expect(decoded.chunkIndex).toBe(i);
      expect(new Uint8Array(await decrypt(peer.sharedKey, decoded.encrypted))).toEqual(
        data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    expect(progress.mock.calls.map(([detail]) => detail.sent)).toEqual([1, 2]);
  });

  it("serialises incoming key derivation before an immediately following encrypted message", async () => {
    const { peer, channel } = await setup();
    const localPublicKey: string = JSON.parse(stringFrame(channel.frames[0])).key;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      golden.privateKeys[1],
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
    const remoteKey = await deriveSharedKey(privateKey, await importPublicKey(localPublicKey));
    const ciphertext = uint8ToBase64(await encrypt(remoteKey, '{"type":"chat","text":"hello"}'));
    const ready = vi.fn(),
      data = vi.fn();
    peer.on("secure-channel-ready", ready);
    peer.on("data", data);
    channel.message(JSON.stringify({ type: "pubkey", key: golden.publicKeys[1] }));
    channel.message(JSON.stringify({ type: "encrypted", data: ciphertext }));
    await vi.waitFor(() => expect(data).toHaveBeenCalledWith({ type: "chat", text: "hello" }));
    expect(ready).toHaveBeenCalledOnce();
    expect(peer.sharedKey).not.toBeNull();
  });

  it("supports a joiner whose data channel is already open", async () => {
    const { peer, rtc, channel } = await setup(false);
    expect(rtc.createDataChannel).not.toHaveBeenCalled();
    expect(peer.dataChannel).not.toBeNull();
    expect(JSON.parse(stringFrame(channel.frames[0])).type).toBe("pubkey");
    expect(channel.bufferedAmountLowThreshold).toBe(BUFFER_LOW);
    channel.dispatchEvent(new Event("open"));
    expect(channel.frames.length).toBe(1);
  });

  it("reports malformed, early, repeated-key and undecryptable peer messages", async () => {
    const { peer, channel } = await setup();
    const error = vi.fn();
    peer.on("error", error);
    for (const data of ["not json", new Uint8Array(2), '{"type":"encrypted","data":"bad"}']) {
      channel.message(data);
    }
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(3));
    channel.message(encodeFileFrame(1, 0, new Uint8Array(28)));
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(4));
    peer.sharedKey = await fixtureKey();
    channel.message('{"type":"pubkey","key":"bad"}');
    channel.message(golden.messages[0].wire.replace('"data":"', '"data":"bad'));
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(6));
    const chunks = vi.fn();
    peer.on("file-chunk", chunks);
    channel.message(encodeFileFrame(1, 0, new Uint8Array(28)));
    await vi.waitFor(() => expect(chunks).toHaveBeenCalledOnce());
    channel.onclose?.();
    channel.onerror?.();
    expect(error).toHaveBeenCalledTimes(7);
  });
});

describe("negotiation, media and teardown", () => {
  it("buffers ICE until a description and answers offers", async () => {
    const { peer, rtc, signaling } = await setup(false);
    const candidate = { candidate: "candidate:1" };
    await peer.handleSignal({ type: "ice-candidate", candidate });
    expect(rtc.addIceCandidate).not.toHaveBeenCalled();
    await peer.handleSignal({ type: "description", sdp: { type: "offer", sdp: "v=0" } });
    expect(rtc.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(signaling.sendSignal).toHaveBeenCalledWith({
      type: "description",
      sdp: { type: "answer", sdp: "v=0" },
    });
    await peer.handleSignal({ type: "ice-candidate", candidate });
    expect(rtc.addIceCandidate).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("resolves glare with initiator=%s", async (initiator) => {
    const { peer, rtc } = await setup(initiator);
    rtc.signalingState = "have-local-offer";
    await peer.handleSignal({ type: "description", sdp: { type: "offer", sdp: "v=0" } });
    expect(rtc.setRemoteDescription).toHaveBeenCalledTimes(initiator ? 0 : 1);
    await peer.handleSignal({ type: "ice-candidate", candidate: { candidate: "glare candidate" } });
    if (initiator) expect(rtc.addIceCandidate).not.toHaveBeenCalled();
  });
  it("sends local offers and candidates and emits remote streams/states", async () => {
    const { peer, rtc, signaling, stream } = await setup();
    await rtc.onnegotiationneeded?.();
    expect(signaling.sendSignal).toHaveBeenCalledWith({
      type: "description",
      sdp: { type: "offer", sdp: "v=0" },
    });
    rtc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "candidate:1" }) } });
    expect(signaling.sendSignal).toHaveBeenLastCalledWith({
      type: "ice-candidate",
      candidate: { candidate: "candidate:1" },
    });
    const remote = vi.fn(),
      state = vi.fn();
    peer.on("remote-stream", remote);
    peer.on("connection-state", state);
    rtc.ontrack?.({ streams: [stream] });
    rtc.onconnectionstatechange?.();
    expect(remote).toHaveBeenCalledWith({ stream });
    expect(state).toHaveBeenCalledWith({ state: "new" });
  });
  it("lets only the initiator make the first offer, then the joiner may renegotiate", async () => {
    const { rtc, signaling } = await setup(false);
    await rtc.onnegotiationneeded?.();
    expect(rtc.setLocalDescription).not.toHaveBeenCalled();
    expect(signaling.sendSignal).not.toHaveBeenCalled();
    rtc.remoteDescription = { type: "answer", sdp: "v=0" };
    await rtc.onnegotiationneeded?.();
    expect(signaling.sendSignal).toHaveBeenCalledWith({
      type: "description",
      sdp: { type: "offer", sdp: "v=0" },
    });
  });
  it("only the initiator restarts ICE and suppresses concurrent restarts", async () => {
    for (const initiator of [true, false]) {
      const { peer, rtc } = await setup(initiator);
      const errors = vi.fn();
      peer.on("error", errors);
      rtc.iceConnectionState = "disconnected";
      rtc.oniceconnectionstatechange?.();
      rtc.oniceconnectionstatechange?.();
      expect(rtc.restartIce).toHaveBeenCalledTimes(initiator ? 1 : 0);
      rtc.iceConnectionState = "connected";
      rtc.oniceconnectionstatechange?.();
      rtc.iceConnectionState = "disconnected";
      rtc.oniceconnectionstatechange?.();
      expect(rtc.restartIce).toHaveBeenCalledTimes(initiator ? 2 : 0);
      rtc.iceConnectionState = "failed";
      rtc.oniceconnectionstatechange?.();
      expect(errors).toHaveBeenCalledOnce();
    }
  });
  it("surfaces negotiation, ICE restart, signal and adaptive encoding failures", async () => {
    const { peer, rtc, signaling } = await setup();
    const errors = vi.fn();
    peer.on("error", errors);
    rtc.setLocalDescription.mockRejectedValueOnce(new Error("SDP failure"));
    await rtc.onnegotiationneeded?.();
    rtc.restartIce.mockImplementationOnce(() => {
      throw new Error("ICE failure");
    });
    rtc.iceConnectionState = "disconnected";
    rtc.oniceconnectionstatechange?.();
    signaling.sendSignal.mockImplementationOnce(() => {
      throw new Error("Socket offline");
    });
    rtc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "candidate:1" }) } });
    expect(errors).toHaveBeenCalledTimes(3);
    rtc.setRemoteDescription.mockRejectedValueOnce(new Error("Remote SDP failure"));
    await expect(
      peer.handleSignal({ type: "description", sdp: { type: "answer" } }),
    ).rejects.toThrow("Remote SDP");
    rtc.sender.setParameters.mockRejectedValueOnce(new Error("Encoding unsupported"));
    await expect(peer.setSendQuality("poor")).rejects.toThrow("Encoding unsupported");
  });
  it("toggles tracks, replaces video and applies all three quality levels", async () => {
    const { peer, rtc, stream } = await setup();
    peer.toggleAudio(false);
    peer.toggleVideo(false);
    expect(Stream.instances[0].tracks.every((track) => !track.enabled)).toBe(true);
    await peer.replaceVideoTrack(stream.getVideoTracks()[0]);
    expect(rtc.sender.replaceTrack).toHaveBeenCalledWith(stream.getVideoTracks()[0]);
    for (const [level, maxBitrate, scaleResolutionDownBy] of [
      ["poor", 200000, 3],
      ["fair", 600000, 1.5],
      ["good", undefined, 1],
    ] as const) {
      await peer.setSendQuality(level);
      expect(rtc.parameters.encodings[0]).toEqual({ maxBitrate, scaleResolutionDownBy });
    }
    rtc.getSenders.mockReturnValue([]);
    await peer.replaceVideoTrack(null);
    await peer.setSendQuality("good");
  });
  it("hangup closes channels, stops tracks, clears handlers and keys, and rejects further operations", async () => {
    const { peer, rtc, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    peer.hangup();
    peer.hangup();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(rtc.close).toHaveBeenCalledOnce();
    expect(Stream.instances[0].tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(
      true,
    );
    expect(rtc.onnegotiationneeded).toBeNull();
    expect(channel.onmessage).toBeNull();
    expect(peer.sharedKey).toBeNull();
    await expect(peer.send({ type: "typing" })).rejects.toThrow("closed");
    await expect(
      peer.handleSignal({ type: "description", sdp: { type: "offer" } }),
    ).rejects.toThrow("not active");
  });
  it("does not create an RTC connection after hangup during key generation", async () => {
    const keyPair = await cryptography.generateKeyPair();
    let finish = (_pair: CryptoKeyPair) => {};
    vi.spyOn(cryptography, "generateKeyPair").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { peer } = newPeer();
    const initialising = peer.initialize(new MediaStream());
    peer.hangup();
    finish(keyPair);
    await expect(initialising).rejects.toThrow("closed");
    expect(Rtc.instances).toHaveLength(0);
  });
  it("does not send after hangup while encryption is pending", async () => {
    const { peer, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    channel.frames = [];
    let finish = (_ciphertext: ArrayBuffer) => {};
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = peer.send({ type: "typing" });
    peer.hangup();
    finish(new ArrayBuffer(16));
    await expect(pending).rejects.toThrow("closed");
    expect(channel.frames).toHaveLength(0);
  });
});

describe("file backpressure, multiplexing and resume", () => {
  it("concurrent transfers demultiplex by file ID", async () => {
    const { peer, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    channel.frames = [];
    const a = new File([new Uint8Array(150 * 1024).fill(1)], "a.bin");
    const b = new File([new Uint8Array(90 * 1024).fill(2)], "b.bin");
    await Promise.all([peer.sendFile(a, { fileId: 1001 }), peer.sendFile(b, { fileId: 2002 })]);
    const byId = new Map<number, Uint8Array<ArrayBuffer>[]>();
    for (const frame of channel.frames) {
      if (typeof frame === "string") continue;
      const decoded = decodeFileFrame(frame);
      const chunks = byId.get(decoded.fileId) ?? [];
      chunks[decoded.chunkIndex] = new Uint8Array(await decrypt(peer.sharedKey, decoded.encrypted));
      byId.set(decoded.fileId, chunks);
    }
    expect(new Blob(byId.get(1001)).size).toBe(a.size);
    expect(new Blob(byId.get(2002)).size).toBe(b.size);
    expect(byId.get(1001)?.every((chunk) => chunk.every((byte) => byte === 1))).toBe(true);
    expect(byId.get(2002)?.every((chunk) => chunk.every((byte) => byte === 2))).toBe(true);
  });
  it("resumes at a chunk index without repeating metadata, and handles empty files", async () => {
    const { peer, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    channel.frames = [];
    await peer.sendFile(new File([new Uint8Array(CHUNK_SIZE + 3)], "resume.bin"), {
      fileId: 2,
      startIndex: 1,
    });
    expect(channel.frames).toHaveLength(1);
    expect(decodeFileFrame(binaryFrame(channel.frames[0])).chunkIndex).toBe(1);
    channel.frames = [];
    await peer.sendFile(new File([], "empty.txt"), { fileId: 3 });
    expect(channel.frames).toHaveLength(1);
    const wrapper = JSON.parse(stringFrame(channel.frames[0]));
    const metadata = JSON.parse(
      new TextDecoder().decode(await decrypt(peer.sharedKey, base64ToUint8(wrapper.data))),
    );
    expect(metadata.chunks).toBe(0);
    expect(metadata.hash).toBe(await sha256(""));
  });
  it("rejects sending before secure-channel-ready and invalid resume arguments", async () => {
    const { peer } = await setup();
    await expect(peer.send({ type: "typing" })).rejects.toThrow("not ready");
    peer.sharedKey = await fixtureKey();
    const file = new File([new Uint8Array(1)], "x");
    for (const options of [
      { startIndex: -1 },
      { startIndex: 2 },
      { fileId: -1 },
      { fileId: 0x100000000 },
    ]) {
      await expect(peer.sendFile(file, options)).rejects.toThrow("Invalid");
    }
  });
  it("pauses above 16 MB and resumes at the 4 MB low watermark", async () => {
    const { peer, channel } = await setup();
    peer.sharedKey = await fixtureKey();
    channel.frames = [];
    channel.bufferedAmount = BUFFER_HIGH + 1;
    const pending = peer.sendFile(new File([new Uint8Array(CHUNK_SIZE + 3)], "x"), {
      fileId: 1,
      startIndex: 1,
    });
    await vi.waitFor(() => expect(channel.frames).toHaveLength(0));
    channel.bufferedAmount = BUFFER_LOW;
    channel.dispatchEvent(new Event("bufferedamountlow"));
    await pending;
    expect(channel.frames).toHaveLength(1);
  });
  it.each(["hangup", "close", "timeout"])(
    "rejects a waiting transfer on %s instead of hanging",
    async (reason) => {
      const { peer, channel } = await setup();
      peer.sharedKey = await fixtureKey();
      channel.bufferedAmount = BUFFER_HIGH + 1;
      vi.useFakeTimers();
      const rejected = expect(
        peer.sendFile(new File([new Uint8Array(CHUNK_SIZE + 3)], "x"), {
          fileId: 1,
          startIndex: 1,
        }),
      ).rejects.toThrow(reason === "timeout" ? "timed out" : "interrupted");
      if (reason === "hangup") peer.hangup();
      else if (reason === "close") channel.close();
      else await vi.advanceTimersByTimeAsync(30000);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
