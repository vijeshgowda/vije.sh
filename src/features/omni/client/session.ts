import { SignalingClient } from "./core/signaling";
import { PeerConnection } from "./core/webrtc";
import { NotificationSounds } from "./core/sounds";
import { sanitiseFileName } from "./core/files";
import { processFileQueue } from "./core/filequeue";
import { FileReceiver, type ReceiveResult } from "./core/receiver";
import {
  getLinkType,
  getQualityLevel,
  type CandidateStats,
  type QualityLevel,
} from "./core/quality";
import { CHUNK_SIZE, type FileMetadata, type Signal } from "./core/protocol";
import { formatBytes } from "./format";
import { MAX_CHAT, type Alert, type Message, type Mode, type OmniAction } from "./state";

export type PeerLike = Pick<
  PeerConnection,
  | "on"
  | "initialize"
  | "handleSignal"
  | "send"
  | "sendFile"
  | "hangup"
  | "replaceVideoTrack"
  | "setSendQuality"
> & {
  readonly pc: Pick<RTCPeerConnection, "getStats"> | null;
  readonly sharedKey: CryptoKey | null;
};
export type SoundsLike = Pick<
  NotificationSounds,
  "ensureAudioContext" | "playJoinTone" | "playMessageTone" | "playHangupTone" | "dispose"
>;

export type SessionDeps = {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  dispatch: (action: OmniAction) => void;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  createSignaling?: (url: string) => SignalingClient;
  createPeer?: (
    signaling: SignalingClient,
    initiator: boolean,
    iceServers: RTCIceServer[],
    password: string,
  ) => PeerLike;
  sounds?: SoundsLike;
  now?: () => number;
  /** Mic meter; null in environments without Web Audio (tests). */
  createAudioContext?: (() => AudioContext) | null;
  objectUrls?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

export type StartOptions = { mode: Mode; code: string; password: string };

const VERIFY_MS = 7_000;
const STATS_MS = 2_000;
const NUDGE_EVERY_MS = 4_000;
const NUDGE_SHOW_MS = 3_000;
const TYPING_SEND_MS = 2_000;
const TYPING_SHOW_MS = 3_000;
const LARGE_FILE = 500 * 1024 * 1024;

/** Maps signalling failures (server text or client errors) to a translated alert. */
export function alertForError(message: string): Alert {
  if (/not found/i.test(message)) return { tone: "error", key: "err.room_not_found" };
  if (/full/i.test(message)) return { tone: "error", key: "err.room_full" };
  if (/in use/i.test(message)) return { tone: "error", key: "err.code_in_use" };
  if (/at least 4/i.test(message)) return { tone: "error", key: "err.custom_length" };
  if (/timed out/i.test(message)) return { tone: "error", key: "err.timeout", retry: true };
  if (/could not reach|closed before|not open/i.test(message))
    return { tone: "error", key: "err.no_server", retry: true };
  return { tone: "error", key: "alert.error", text: message, retry: true };
}

/**
 * One Omni call attempt at a time: media → signalling → lobby → call. Framework-free; the island
 * renders state from the actions it dispatches. Everything it owns is released by teardown().
 */
export class OmniSession {
  private readonly dispatch: (action: OmniAction) => void;
  private readonly sounds: SoundsLike;
  private readonly now: () => number;
  private run = 0;
  private stage: "idle" | "connecting" | "awaiting" | "lobby" | "call" = "idle";
  private signaling: SignalingClient | null = null;
  private peer: PeerLike | null = null;
  private stream: MediaStream | null = null;
  private password = "";
  private pending: Signal[] = [];
  private unsubscribe: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private verifyTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private stats = { bytes: 0, at: 0, level: "good" as QualityLevel, key: "" };
  private mic = true;
  private cam = true;
  private facing: "user" | "environment" = "user";
  private ending = false;
  private meter: { ctx: AudioContext; raf: number; track: MediaStreamTrack } | null = null;
  private nudgedAt = -Infinity;
  private levelListener: ((level: number) => void) | null = null;
  private receiver: FileReceiver | null = null;
  /** Object URLs of received files, by transfer key; revoked on clear and teardown. */
  private urls = new Map<string, string>();
  private progress = new Map<string, number>();
  private typingSent = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SessionDeps) {
    this.dispatch = deps.dispatch;
    this.sounds = deps.sounds ?? new NotificationSounds();
    this.now = deps.now ?? Date.now;
  }

  /** Receives the mic level (0..1) every animation frame; written to the DOM, not React state. */
  setLevelListener(listener: ((level: number) => void) | null) {
    this.levelListener = listener;
  }

  async start({ mode, code, password }: StartOptions) {
    this.teardown();
    const run = this.run;
    this.password = password;
    void this.sounds.ensureAudioContext().catch(() => undefined);
    this.dispatch({ type: "media-request", mode });

    const stream = await this.acquireMedia();
    if (run !== this.run) {
      stream?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!stream) {
      this.dispatch({ type: "reset", alert: { tone: "error", key: "err.media_blocked" } });
      return;
    }
    this.stream = stream;
    const hasVideo = stream.getVideoTracks().length > 0;
    this.mic = true;
    this.cam = hasVideo;
    this.facing = "user";
    this.dispatch({ type: "media-ready", stream, hasVideo });

    this.stage = "connecting";
    this.dispatch({ type: "connecting" });
    const signaling = (this.deps.createSignaling ?? ((url) => new SignalingClient(url)))(
      this.deps.signalingUrl,
    );
    this.signaling = signaling;
    try {
      await signaling.connect();
    } catch (error) {
      if (run !== this.run) return;
      this.fail(alertForError(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (run !== this.run) return;
    this.listen(signaling);
    this.stage = "awaiting";
    try {
      if (mode === "create") signaling.createRoom(code);
      else signaling.joinRoom(code);
    } catch (error) {
      this.fail(alertForError(error instanceof Error ? error.message : String(error)));
    }
  }

  /** Close the lobby or abandon a connect attempt. */
  cancel() {
    this.teardown();
    this.dispatch({ type: "reset" });
  }

  hangup() {
    void this.sounds.playHangupTone().catch(() => undefined);
    this.teardown();
    this.dispatch({ type: "reset" });
  }

  toggleMic() {
    this.mic = !this.mic;
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = this.mic));
    this.dispatch({ type: "mic", on: this.mic });
  }

  toggleCam() {
    if (!this.stream?.getVideoTracks().length) return;
    this.cam = !this.cam;
    this.stream.getVideoTracks().forEach((track) => (track.enabled = this.cam));
    this.dispatch({ type: "cam", on: this.cam });
  }

  async flip() {
    const stream = this.stream;
    const media = this.deps.mediaDevices ?? globalThis.navigator?.mediaDevices;
    const old = stream?.getVideoTracks()[0];
    if (!stream || !old || !media) return;
    const run = this.run;
    const facing = this.facing === "user" ? "environment" : "user";
    let track: MediaStreamTrack | undefined;
    try {
      const fresh = await media.getUserMedia({ video: { facingMode: facing }, audio: false });
      track = fresh.getVideoTracks()[0];
    } catch {
      return;
    }
    if (!track) return;
    if (run !== this.run || this.stream !== stream) {
      track.stop();
      return;
    }
    track.enabled = this.cam;
    old.stop();
    stream.removeTrack(old);
    stream.addTrack(track);
    this.facing = facing;
    await this.peer?.replaceVideoTrack(track).catch(() => undefined);
    this.dispatch({ type: "local-tracks", facing });
  }

  /** Sends a chat message; resolves false when it couldn't be sent (the log says why). */
  async sendChat(text: string): Promise<boolean> {
    const message = text.trim().slice(0, MAX_CHAT);
    const peer = this.peer;
    if (!message) return false;
    if (!peer?.sharedKey || this.stage !== "call") {
      this.system({ key: "sys.send_failed_notready" });
      return false;
    }
    try {
      await peer.send({ type: "chat", text: message });
    } catch {
      if (this.peer === peer) this.system({ key: "sys.send_failed_notready" });
      return false;
    }
    if (this.peer !== peer) return false;
    this.dispatch({ type: "chat", from: "me", text: message, at: this.now() });
    return true;
  }

  /** Tells the peer we're typing, at most once every 2 s. */
  typing() {
    const peer = this.peer;
    if (!peer?.sharedKey || this.typingSent) return;
    this.typingSent = true;
    void peer.send({ type: "typing" }).catch(() => undefined);
    this.later(() => (this.typingSent = false), TYPING_SEND_MS);
  }

  /** Each file gets its own ID and is sent concurrently; frames carry the ID. */
  sendFiles(files: readonly File[]) {
    const peer = this.peer;
    if (!files.length) return;
    if (!peer?.sharedKey || this.stage !== "call") {
      this.system({ key: "sys.send_failed_notready" });
      return;
    }
    const run = this.run;
    const queue = files.map((file) => ({
      file,
      fileId: crypto.getRandomValues(new Uint32Array(1))[0]!,
    }));
    for (const { file, fileId } of queue) {
      this.dispatch({
        type: "transfer-start",
        transfer: {
          key: `out:${fileId}`,
          direction: "out",
          name: file.name,
          size: file.size,
          total: Math.ceil(file.size / CHUNK_SIZE),
        },
      });
      this.system({
        key: "sys.sending",
        params: { name: file.name, size: formatBytes(file.size) },
      });
    }
    void processFileQueue(
      queue,
      ({ file, fileId }) => peer.sendFile(file, { fileId }),
      (result) => {
        if (run !== this.run) return;
        const key = `out:${result.file.fileId}`;
        const name = result.file.file.name;
        this.progress.delete(key);
        if (result.status === "sent") {
          this.dispatch({ type: "transfer-done", key, url: null, preview: null, at: this.now() });
          this.system({ key: "sys.sent", params: { name } });
        } else {
          this.dispatch({ type: "transfer-failed", key });
          const error = result.error instanceof Error ? result.error.message : String(result.error);
          this.system({ key: "sys.send_failed", params: { error } });
        }
      },
    );
  }

  /** Clears the log and finished transfers, and revokes received files' object URLs. */
  clearChat() {
    this.revokeUrls();
    this.dispatch({ type: "chat-clear", at: this.now() });
  }

  confirmSas() {
    this.dispatch({ type: "sas-close" });
  }

  rejectSas() {
    this.dispatch({ type: "sas-close" });
    this.end("end.sas_mismatch", 800);
  }

  dispose() {
    this.teardown();
    this.levelListener = null;
    void this.sounds.dispose().catch(() => undefined);
  }

  private async acquireMedia() {
    const media = this.deps.mediaDevices ?? globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) return null;
    try {
      return await media.getUserMedia({ video: true, audio: true });
    } catch {
      // Same fallback as the original: no camera (or it's busy) → audio only.
      try {
        return await media.getUserMedia({ video: false, audio: true });
      } catch {
        return null;
      }
    }
  }

  private listen(signaling: SignalingClient) {
    const on = this.unsubscribe;
    on.push(
      signaling.on("created", ({ code, custom }) => {
        const status =
          this.stage === "lobby"
            ? ({ key: "lobby.new_room" } as const)
            : ({ key: custom ? "lobby.custom_ready" : "lobby.waiting" } as const);
        this.stage = "lobby";
        this.dispatch({ type: "lobby-open", code, custom, at: this.now(), status });
      }),
      signaling.on("rejoined", ({ code, custom }) => {
        this.stage = "lobby";
        this.dispatch({
          type: "lobby-open",
          code,
          custom,
          at: this.now(),
          status: { key: "lobby.reconnected" },
        });
      }),
      signaling.on("rejoin-failed", () => {
        this.dispatch({ type: "lobby-status", status: { key: "lobby.session_expired" } });
        try {
          signaling.recreateRoom();
        } catch (error) {
          this.fail(alertForError(error instanceof Error ? error.message : String(error)));
        }
      }),
      signaling.on("reconnecting", ({ attempt, max }) => {
        if (this.stage !== "lobby") return;
        this.dispatch({
          type: "lobby-status",
          status: { key: "lobby.reconnecting", params: { attempt, max } },
        });
      }),
      signaling.on("reconnect-failed", () => {
        // In a call the media path is peer-to-peer and keeps going without signalling.
        if (this.stage === "lobby")
          this.fail({ tone: "error", key: "err.reconnect_failed", retry: true });
      }),
      signaling.on("peer-joined", () => {
        if (this.stage !== "lobby") return;
        this.dispatch({ type: "lobby-status", status: { key: "lobby.peer_found" } });
        void this.sounds.playJoinTone().catch(() => undefined);
        void this.startCall(true);
      }),
      signaling.on("joined", () => {
        if (this.stage === "awaiting") void this.startCall(false);
      }),
      signaling.on("peer-left", () => {
        if (this.stage !== "call") return;
        void this.sounds.playHangupTone().catch(() => undefined);
        this.end("end.peer_left", 3_000);
      }),
      signaling.on("signal", ({ payload }) => {
        if (this.peer?.pc) this.handleSignal(this.peer, payload);
        else this.pending.push(payload);
      }),
      signaling.on("error", ({ message }) => {
        // Lobby and call errors are transport hiccups the client retries on its own.
        if (this.stage === "awaiting" || this.stage === "connecting")
          this.fail(alertForError(message));
      }),
      signaling.on("disconnected", () => {
        if (this.stage === "awaiting")
          this.fail(alertForError("Could not reach signalling server"));
      }),
    );
  }

  private handleSignal(peer: PeerLike, payload: Signal) {
    peer.handleSignal(payload).catch((error: unknown) => {
      if (this.peer === peer) this.notice(error);
    });
  }

  private async startCall(initiator: boolean) {
    const signaling = this.signaling;
    const stream = this.stream;
    if (!signaling || !stream) return;
    const run = this.run;
    this.stage = "call";
    signaling.phase = "call";
    this.dispatch({ type: "call-start", code: signaling.roomCode ?? "" });
    const peer = (
      this.deps.createPeer ??
      ((s, i, ice, password) => new PeerConnection(s, i, ice, password) as PeerLike)
    )(signaling, initiator, this.deps.iceServers, this.password);
    this.peer = peer;
    const receiver = new FileReceiver(() => peer.sharedKey);
    this.receiver = receiver;
    if (!stream.getVideoTracks().length) this.system({ key: "sys.audio_only" });
    this.unsubscribe.push(
      peer.on("remote-stream", ({ stream: remote }) =>
        this.dispatch({ type: "remote", stream: remote }),
      ),
      peer.on("secure-channel-ready", ({ safety }) => {
        this.dispatch({ type: "secure", safety, at: this.now() });
        this.system({ key: "sys.channel_ready" });
        this.startVerify(peer);
        this.startStats();
        this.startMeter();
      }),
      peer.on("ice-state", ({ state }) => {
        if (state === "connected" || state === "completed") {
          this.dispatch({ type: "connection", state: "connected", at: this.now() });
          this.startStats();
        } else if (state === "disconnected") {
          this.dispatch({ type: "connection", state: "reconnecting" });
        } else if (state === "failed") {
          this.dispatch({ type: "connection", state: "failed" });
        }
      }),
      peer.on("ice-restarting", () => this.dispatch({ type: "connection", state: "reconnecting" })),
      peer.on("data", (message) => {
        if (message.type === "__verify")
          void peer.send({ type: "__verified" }).catch(() => undefined);
        if (message.type === "__verified") this.clearVerify();
        if (message.type === "chat") {
          this.clearTyping();
          this.dispatch({
            type: "chat",
            from: "peer",
            text: message.text.slice(0, MAX_CHAT),
            at: this.now(),
          });
          void this.sounds.playMessageTone().catch(() => undefined);
        }
        if (message.type === "typing") this.showTyping();
        if (message.type === "file-meta") this.receiveMeta(receiver, message);
      }),
      peer.on("file-chunk", ({ data }) => {
        const run = this.run;
        receiver.chunk(data).then(
          (result) => {
            if (run === this.run && result) this.received(result);
          },
          (error: unknown) => {
            if (run === this.run) this.notice(error);
          },
        );
      }),
      peer.on("file-send-progress", ({ fileId, sent, total }) =>
        this.reportProgress(`out:${fileId}`, sent, total),
      ),
      peer.on("error", ({ message }) => this.dispatch({ type: "notice", text: message })),
    );
    try {
      await peer.initialize(stream);
    } catch (error) {
      if (run !== this.run) return;
      this.notice(error);
      this.fail({ tone: "error", key: "err.connect_failed", retry: true });
      return;
    }
    if (run !== this.run) return;
    for (const payload of this.pending.splice(0)) this.handleSignal(peer, payload);
  }

  private receiveMeta(receiver: FileReceiver, meta: FileMetadata) {
    let result: ReceiveResult | null;
    try {
      result = receiver.begin(meta);
    } catch (error) {
      this.notice(error);
      return;
    }
    const name = sanitiseFileName(meta.name);
    const size = formatBytes(meta.size);
    this.dispatch({
      type: "transfer-start",
      transfer: {
        key: `in:${meta.fileId}`,
        direction: "in",
        name,
        size: meta.size,
        total: meta.chunks,
      },
    });
    this.system(
      meta.size > LARGE_FILE
        ? { key: "sys.rx_large", params: { name, size } }
        : { key: "sys.rx_receiving", params: { name, size } },
    );
    if (result) this.received(result);
  }

  private received(result: ReceiveResult) {
    const key = `in:${result.fileId}`;
    if (result.type === "progress") {
      this.reportProgress(key, result.received, result.total);
      return;
    }
    this.progress.delete(key);
    if (result.type === "failed") {
      this.dispatch({ type: "transfer-failed", key });
      this.system({
        key: "sys.integrity_fail",
        params: { name: sanitiseFileName(result.meta.name) },
      });
      return;
    }
    const urls = this.deps.objectUrls ?? URL;
    const url = urls.createObjectURL(result.blob);
    this.urls.set(key, url);
    this.dispatch({ type: "transfer-done", key, url, preview: result.preview, at: this.now() });
  }

  /** Progress only re-renders when the whole percentage changes. */
  private reportProgress(key: string, done: number, total: number) {
    const percent = total > 0 ? Math.floor((done / total) * 100) : 100;
    if (this.progress.get(key) === percent) return;
    this.progress.set(key, percent);
    this.dispatch({ type: "transfer-progress", key, done });
  }

  private showTyping() {
    this.clearTyping();
    this.dispatch({ type: "typing", on: true });
    this.typingTimer = setTimeout(() => {
      this.typingTimer = null;
      this.dispatch({ type: "typing", on: false });
    }, TYPING_SHOW_MS);
  }

  private clearTyping() {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = null;
  }

  private system(message: Message) {
    this.dispatch({ type: "system", message, at: this.now() });
  }

  private revokeUrls() {
    const urls = this.deps.objectUrls ?? URL;
    this.urls.forEach((url) => urls.revokeObjectURL(url));
    this.urls.clear();
  }

  private notice(error: unknown) {
    this.dispatch({
      type: "notice",
      text: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Passwords only change the derived key, so a mismatch still "connects". Each side sends an
   * encrypted __verify; no __verified within 7 s means the keys differ.
   */
  private startVerify(peer: PeerLike) {
    if (!this.password) return;
    this.clearVerify();
    void peer.send({ type: "__verify" }).catch(() => undefined);
    this.verifyTimer = setTimeout(() => {
      this.verifyTimer = null;
      this.end("end.wrong_password", 2_500);
    }, VERIFY_MS);
  }

  private clearVerify() {
    if (this.verifyTimer) clearTimeout(this.verifyTimer);
    this.verifyTimer = null;
  }

  private startStats() {
    if (this.statsTimer) return;
    this.stats = { bytes: 0, at: 0, level: "good", key: "" };
    this.statsTimer = setInterval(() => void this.pollStats(), STATS_MS);
  }

  private async pollStats() {
    const peer = this.peer;
    if (!peer?.pc) return;
    let report: RTCStatsReport;
    try {
      report = await peer.pc.getStats();
    } catch {
      return;
    }
    if (this.peer !== peer) return;
    let bytes = 0;
    let lost = 0;
    let received = 0;
    let rtt: number | null = null;
    let pairRtt = 0;
    const entries: Record<string, unknown>[] = [];
    report.forEach((entry: Record<string, unknown>) => {
      entries.push(entry);
      const video = entry.kind === "video";
      if (entry.type === "inbound-rtp" && video) {
        bytes = Number(entry.bytesReceived) || 0;
        lost = Number(entry.packetsLost) || 0;
        received = Number(entry.packetsReceived) || 0;
      } else if (entry.type === "remote-inbound-rtp" && video && entry.roundTripTime != null) {
        rtt = Number(entry.roundTripTime);
      } else if (entry.type === "candidate-pair" && entry.state === "succeeded") {
        pairRtt = Number(entry.currentRoundTripTime) || 0;
      }
    });
    const at = this.now();
    const first = this.stats.at === 0;
    const bitrate = first ? 0 : ((bytes - this.stats.bytes) * 8) / ((at - this.stats.at) / 1000);
    this.stats.bytes = bytes;
    this.stats.at = at;
    const packetLoss = received > 0 ? (lost / (received + lost)) * 100 : 0;
    // Audio-only calls have no inbound video, so judge them by round-trip time and loss alone.
    const hasVideo = entries.some(
      (entry) => entry.type === "inbound-rtp" && entry.kind === "video",
    );
    // The first video sample has no previous byte count, so its bitrate would read as "poor".
    if (hasVideo && first) return;
    const roundTrip = rtt ?? pairRtt;
    const quality = getQualityLevel({
      bitrate: hasVideo ? bitrate : Number.MAX_SAFE_INTEGER,
      packetLoss,
      rtt: roundTrip,
    });
    const level = quality.level;
    const label = hasVideo
      ? quality.label
      : `${packetLoss.toFixed(1)}% loss · ${Math.round(roundTrip * 1000)}ms`;
    const link = getLinkType(entries as CandidateStats[]);
    const key = `${level}|${label}|${link}`;
    if (key !== this.stats.key) {
      this.stats.key = key;
      this.dispatch({ type: "stats", quality: level, label, link });
    }
    if (level !== this.stats.level) {
      this.stats.level = level;
      await peer.setSendQuality(level).catch(() => undefined);
    }
  }

  private startMeter() {
    const track = this.stream?.getAudioTracks()[0];
    const create =
      this.deps.createAudioContext === undefined
        ? typeof AudioContext === "function"
          ? () => new AudioContext()
          : null
        : this.deps.createAudioContext;
    if (!track || !create || this.meter) return;
    try {
      const ctx = create();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      // A muted (disabled) track feeds silence, so the meter listens to its own clone: it still
      // hears speech while muted, which is what the "you're muted" nudge needs.
      const listen = track.clone();
      ctx.createMediaStreamSource(new MediaStream([listen])).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      const meter = { ctx, raf: 0, track: listen };
      // requestAnimationFrame stops while the tab is hidden, so the meter pauses with it.
      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) {
          const value = (sample - 128) / 128;
          sum += value * value;
        }
        this.onLevel(Math.sqrt(sum / buffer.length));
        meter.raf = requestAnimationFrame(tick);
      };
      this.meter = meter;
      tick();
    } catch {
      // The meter is optional; calls work without Web Audio.
    }
  }

  /** Public for tests: rms 0..~1 from the analyser. */
  onLevel(rms: number) {
    this.levelListener?.(Math.min(1, rms * 3));
    if (this.mic || rms <= 0.06 || this.stage !== "call") return;
    const now = this.now();
    if (now - this.nudgedAt <= NUDGE_EVERY_MS) return;
    this.nudgedAt = now;
    this.dispatch({ type: "nudge", on: true });
    this.later(() => this.dispatch({ type: "nudge", on: false }), NUDGE_SHOW_MS);
  }

  private end(key: Alert["key"], delay: number) {
    if (this.ending) return;
    this.ending = true;
    this.clearVerify();
    this.dispatch({ type: "ending", key });
    this.later(() => {
      this.teardown();
      this.dispatch({ type: "reset", alert: { tone: "info", key } });
    }, delay);
  }

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private fail(alert: Alert) {
    this.teardown();
    this.dispatch({ type: "reset", alert });
  }

  private teardown() {
    this.run++;
    this.stage = "idle";
    this.ending = false;
    this.unsubscribe.splice(0).forEach((off) => off());
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.clearVerify();
    this.clearTyping();
    this.typingSent = false;
    this.receiver?.clear();
    this.receiver = null;
    this.revokeUrls();
    this.progress.clear();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.meter) {
      cancelAnimationFrame(this.meter.raf);
      this.meter.track.stop();
      void this.meter.ctx.close().catch(() => undefined);
      this.meter = null;
    }
    this.levelListener?.(0);
    this.peer?.hangup();
    this.peer = null;
    this.signaling?.disconnect();
    this.signaling = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.pending = [];
    this.nudgedAt = -Infinity;
  }
}
