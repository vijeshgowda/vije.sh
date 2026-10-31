import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKey,
  encrypt,
  decrypt,
  safetyString,
  uint8ToBase64,
  base64ToUint8,
  IncrementalSHA256,
  type SafetyString,
} from "./crypto";
import { OmniEvents } from "./events";
import {
  BUFFER_HIGH,
  BUFFER_LOW,
  CHUNK_SIZE,
  encodeFileFrame,
  decodeFileFrame,
  channelMessageSchema,
  dataMessageSchema,
  type DataMessage,
  type Signal,
} from "./protocol";
import type { QualityLevel } from "./quality";

type PeerEvents = {
  "remote-stream": { stream: MediaStream };
  "ice-state": { state: RTCIceConnectionState };
  "connection-state": { state: RTCPeerConnectionState };
  "ice-restarting": undefined;
  "secure-channel-ready": { safety: SafetyString };
  "channel-closed": undefined;
  "file-chunk": { data: ArrayBuffer };
  "file-send-progress": { fileId: number; name: string; sent: number; total: number };
  data: DataMessage;
  error: { message: string };
};

export class PeerConnection extends OmniEvents<PeerEvents> {
  pc: RTCPeerConnection | null = null;
  dataChannel: RTCDataChannel | null = null;
  localStream: MediaStream | null = null;
  sharedKey: CryptoKey | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private localPublicKey: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private iceRestartInProgress = false;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private lifetime = new AbortController();
  private incoming = Promise.resolve();

  constructor(
    private readonly signaling: { sendSignal(payload: Signal): void },
    readonly isInitiator: boolean,
    private readonly iceServers: RTCIceServer[],
    private readonly passphrase = "",
  ) {
    super();
  }

  async initialize(localStream: MediaStream) {
    if (this.localStream || this.lifetime.signal.aborted)
      throw new Error("Peer has already been initialised or closed");
    this.localStream = localStream;
    const keyPair = await generateKeyPair();
    this.checkActive();
    this.keyPair = keyPair;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    pc.ontrack = ({ streams }) => {
      if (streams[0]) this.emit("remote-stream", { stream: streams[0] });
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        try {
          this.signaling.sendSignal({ type: "ice-candidate", candidate: candidate.toJSON() });
        } catch (error) {
          this.reportError("Could not send ICE candidate", error);
        }
      }
    };
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      this.emit("ice-state", { state });
      if (state === "disconnected") this.attemptIceRestart();
      if (state === "failed") {
        this.iceRestartInProgress = false;
        this.emit("error", { message: "Connection lost. Check your network or TURN config." });
      }
      if (state === "connected" || state === "completed") this.iceRestartInProgress = false;
    };
    pc.onconnectionstatechange = () => this.emit("connection-state", { state: pc.connectionState });
    pc.onnegotiationneeded = async () => {
      if (this.lifetime.signal.aborted || pc.signalingState === "closed") return;
      // The initiator makes the first offer. A joiner offering too (addTrack fires this) causes
      // glare, and after the polite rollback Chrome can answer without gathering any ICE.
      if (!this.isInitiator && !pc.remoteDescription) return;
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.checkActive();
        if (!pc.localDescription) throw new Error("Missing local session description");
        this.signaling.sendSignal({ type: "description", sdp: pc.localDescription.toJSON() });
      } catch (error) {
        if (!this.lifetime.signal.aborted) this.reportError("Negotiation failed", error);
      } finally {
        this.makingOffer = false;
      }
    };
    if (this.isInitiator) {
      this.setupDataChannel(pc.createDataChannel("project-a", { ordered: true }));
    } else {
      pc.ondatachannel = ({ channel }) => this.setupDataChannel(channel);
    }
  }

  private attemptIceRestart() {
    if (
      !this.isInitiator ||
      this.iceRestartInProgress ||
      !this.pc ||
      this.pc.signalingState === "closed" ||
      this.lifetime.signal.aborted
    )
      return;
    this.iceRestartInProgress = true;
    this.emit("ice-restarting", undefined);
    try {
      this.pc.restartIce();
    } catch (error) {
      this.iceRestartInProgress = false;
      this.reportError("ICE restart failed", error);
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW;
    let sent = false;
    const sendPublicKey = async () => {
      if (sent || !this.keyPair) return;
      sent = true;
      try {
        const publicKey = await exportPublicKey(this.keyPair);
        this.checkActive();
        if (channel.readyState !== "open")
          throw new Error("Data channel closed during key exchange");
        this.localPublicKey = publicKey;
        channel.send(JSON.stringify({ type: "pubkey", key: publicKey }));
      } catch (error) {
        if (!this.lifetime.signal.aborted) this.reportError("Public key exchange failed", error);
      }
    };
    channel.addEventListener("open", sendPublicKey, { signal: this.lifetime.signal });
    if (channel.readyState === "open") void sendPublicKey();
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      // ECDH derivation must finish before decrypting the following ordered message.
      this.incoming = this.incoming
        .then(() => this.receive(data))
        .catch((error) => {
          if (!this.lifetime.signal.aborted)
            this.reportError("Invalid or undecryptable peer message", error);
        });
    };
    channel.onclose = () => this.emit("channel-closed", undefined);
    channel.onerror = () => this.emit("error", { message: "Data channel error" });
  }

  private async receive(data: unknown) {
    this.checkActive();
    if (data instanceof ArrayBuffer) {
      decodeFileFrame(data);
      if (!this.sharedKey) throw new Error("File chunk received before key exchange");
      this.emit("file-chunk", { data });
      return;
    }
    if (typeof data !== "string") throw new Error("Unsupported peer message");
    const value: unknown = JSON.parse(data);
    const message = channelMessageSchema.parse(value);
    if (message.type === "pubkey") {
      if (!this.keyPair || this.sharedKey) throw new Error("Unexpected public key exchange");
      const peerKey = await importPublicKey(message.key);
      const key = await deriveSharedKey(this.keyPair.privateKey, peerKey, this.passphrase);
      const local = this.localPublicKey ?? (await exportPublicKey(this.keyPair));
      const safety = await safetyString(local, message.key);
      this.checkActive();
      this.sharedKey = key;
      this.emit("secure-channel-ready", { safety });
    } else {
      if (!this.sharedKey) throw new Error("Encrypted message received before key exchange");
      const plaintext = await decrypt(this.sharedKey, base64ToUint8(message.data));
      const inner: unknown = JSON.parse(new TextDecoder().decode(plaintext));
      this.checkActive();
      this.emit("data", dataMessageSchema.parse(inner));
    }
  }

  async handleSignal(payload: Signal) {
    const pc = this.pc;
    if (!pc || this.lifetime.signal.aborted) throw new Error("Peer connection is not active");
    try {
      if (payload.type === "description") {
        const description = payload.sdp;
        const ready =
          !this.makingOffer && (pc.signalingState === "stable" || this.settingRemoteAnswer);
        const collision = description.type === "offer" && !ready;
        this.ignoreOffer = this.isInitiator && collision;
        if (this.ignoreOffer) return;
        this.settingRemoteAnswer = description.type === "answer";
        await pc.setRemoteDescription(description);
        this.checkActive();
        for (const candidate of this.pendingIce.splice(0)) {
          await pc.addIceCandidate(candidate);
          this.checkActive();
        }
        if (description.type === "offer") {
          await pc.setLocalDescription();
          this.checkActive();
          if (!pc.localDescription) throw new Error("Missing local session description");
          this.signaling.sendSignal({ type: "description", sdp: pc.localDescription.toJSON() });
        }
      } else {
        if (!pc.remoteDescription) {
          if (!this.ignoreOffer) this.pendingIce.push(payload.candidate);
        } else {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch (error) {
            // Perfect negotiation intentionally discards ICE belonging to an ignored glare offer.
            if (!this.ignoreOffer) throw error;
          }
        }
      }
    } finally {
      this.settingRemoteAnswer = false;
    }
  }

  async send(data: DataMessage) {
    const { channel, key } = this.secureChannel();
    const encrypted = await encrypt(key, JSON.stringify(dataMessageSchema.parse(data)));
    this.secureChannel();
    channel.send(JSON.stringify({ type: "encrypted", data: uint8ToBase64(encrypted) }));
  }

  async sendFile(
    file: File,
    {
      fileId = crypto.getRandomValues(new Uint32Array(1))[0],
      startIndex = 0,
    }: { fileId?: number; startIndex?: number } = {},
  ) {
    this.secureChannel();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    if (
      !Number.isInteger(startIndex) ||
      startIndex < 0 ||
      startIndex > totalChunks ||
      !Number.isInteger(fileId) ||
      fileId < 0 ||
      fileId > 0xffffffff
    ) {
      throw new Error("Invalid file ID or resume index");
    }
    if (startIndex === 0) {
      const hash = new IncrementalSHA256();
      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        hash.update(await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer());
        this.checkActive();
      }
      await this.send({
        type: "file-meta",
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        hash: hash.digest(),
        chunks: totalChunks,
      });
    }
    for (let index = startIndex; index < totalChunks; index++) {
      await this.waitForBuffer();
      const plaintext = await file
        .slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
        .arrayBuffer();
      const encrypted = await encrypt(this.secureChannel().key, plaintext);
      await this.waitForBuffer();
      this.secureChannel().channel.send(encodeFileFrame(fileId, index, encrypted));
      this.emit("file-send-progress", {
        fileId,
        name: file.name,
        sent: index + 1,
        total: totalChunks,
      });
    }
  }

  private async waitForBuffer() {
    const channel = this.secureChannel().channel;
    while (channel.bufferedAmount > BUFFER_HIGH) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          channel.removeEventListener("bufferedamountlow", drain);
          channel.removeEventListener("close", closed);
          channel.removeEventListener("error", closed);
          this.lifetime.signal.removeEventListener("abort", closed);
        };
        const drain = () => {
          cleanup();
          resolve();
        };
        const closed = () => {
          cleanup();
          reject(new Error("File transfer interrupted"));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("File transfer buffer timed out"));
        }, 30_000);
        channel.addEventListener("bufferedamountlow", drain);
        channel.addEventListener("close", closed);
        channel.addEventListener("error", closed);
        this.lifetime.signal.addEventListener("abort", closed);
        if (channel.bufferedAmount <= BUFFER_LOW) drain();
        else if (channel.readyState !== "open" || this.lifetime.signal.aborted) closed();
      });
      this.secureChannel();
    }
  }

  toggleAudio(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  toggleVideo(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async replaceVideoTrack(track: MediaStreamTrack | null) {
    const sender = this.pc?.getSenders().find((entry) => entry.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
  }

  async setSendQuality(level: QualityLevel) {
    const sender = this.pc?.getSenders().find((entry) => entry.track?.kind === "video");
    if (!sender) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    const config = {
      good: { maxBitrate: undefined, scaleResolutionDownBy: 1 },
      fair: { maxBitrate: 600_000, scaleResolutionDownBy: 1.5 },
      poor: { maxBitrate: 200_000, scaleResolutionDownBy: 3 },
    }[level];
    Object.assign(parameters.encodings[0], config);
    await sender.setParameters(parameters);
  }

  hangup() {
    this.lifetime.abort();
    this.localStream?.getTracks().forEach((track) => track.stop());
    if (this.dataChannel) {
      this.dataChannel.onmessage = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.close();
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onnegotiationneeded = null;
      this.pc.ondatachannel = null;
      this.pc.close();
    }
    this.sharedKey = null;
    this.keyPair = null;
    this.localPublicKey = null;
    this.localStream = null;
    this.dataChannel = null;
    this.pc = null;
    this.pendingIce = [];
  }

  private checkActive() {
    if (this.lifetime.signal.aborted) throw new Error("Peer connection closed");
  }

  private secureChannel() {
    this.checkActive();
    if (!this.sharedKey || !this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Secure channel not ready");
    }
    return { key: this.sharedKey, channel: this.dataChannel };
  }

  private reportError(context: string, error: unknown) {
    this.emit("error", {
      message: `${context}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
