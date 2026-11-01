import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OmniEvents } from "./core/events";
import { encrypt, sha256 } from "./core/crypto";
import { CHUNK_SIZE, encodeFileFrame, type FileMetadata } from "./core/protocol";
import { SignalingClient, type SignalingSocket } from "./core/signaling";
import { MAX_INCOMING } from "./core/receiver";
import {
  OmniSession,
  SEND_CONCURRENCY,
  alertForError,
  type PeerLike,
  type SessionDeps,
} from "./session";
import type { OmniAction } from "./state";

class Socket extends EventTarget implements SignalingSocket {
  readyState = 0;
  sent: unknown[] = [];
  send = vi.fn((data: string) => void this.sent.push(JSON.parse(data)));
  close = vi.fn(() => {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  });
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(data: object) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

class Track {
  enabled = true;
  stop = vi.fn();
  clones: Track[] = [];
  private ended: (() => void)[] = [];
  constructor(readonly kind: "audio" | "video") {}
  addEventListener = (type: string, listener: () => void) => {
    if (type === "ended") this.ended.push(listener);
  };
  end() {
    this.ended.forEach((listener) => listener());
  }
  clone = () => {
    const copy = new Track(this.kind);
    this.clones.push(copy);
    return copy;
  };
}

class Stream {
  constructor(public tracks: Track[]) {}
  getTracks = () => this.tracks;
  getAudioTracks = () => this.tracks.filter((track) => track.kind === "audio");
  getVideoTracks = () => this.tracks.filter((track) => track.kind === "video");
  addTrack = (track: Track) => void this.tracks.push(track);
  removeTrack = (track: Track) => void (this.tracks = this.tracks.filter((t) => t !== track));
}

class Peer extends OmniEvents<Record<string, unknown>> {
  pc: { getStats: ReturnType<typeof vi.fn> } | null = null;
  sharedKey: CryptoKey | null = null;
  sendFile = vi.fn(async (_file: File, _options: { fileId: number }) => undefined);
  initialize = vi.fn(async () => {
    this.pc = { getStats: vi.fn(async () => this.stats) };
  });
  handleSignal = vi.fn(async () => undefined);
  send = vi.fn(async (_message: unknown) => undefined);
  hangup = vi.fn();
  replaceVideoTrack = vi.fn(async () => undefined);
  setSendQuality = vi.fn(async () => undefined);
  stats: Record<string, unknown>[] = [];
  fire(type: string, detail?: unknown) {
    this.emit(type, detail);
  }
}

const sessions: OmniSession[] = [];

function setup(overrides: Partial<SessionDeps> = {}) {
  const sockets: Socket[] = [];
  const peers: Peer[] = [];
  const peerArgs: unknown[][] = [];
  const actions: OmniAction[] = [];
  const getUserMedia = vi.fn(
    async (constraints: MediaStreamConstraints) =>
      new Stream(
        constraints.video ? [new Track("audio"), new Track("video")] : [new Track("audio")],
      ) as unknown as MediaStream,
  );
  const sounds = {
    ensureAudioContext: vi.fn(async () => undefined),
    playJoinTone: vi.fn(async () => undefined),
    playMessageTone: vi.fn(async () => undefined),
    playHangupTone: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  let urlCount = 0;
  const objectUrls = {
    createObjectURL: vi.fn((_blob: Blob) => `blob:test/${++urlCount}`),
    revokeObjectURL: vi.fn(),
  };
  const session = new OmniSession({
    signalingUrl: "ws://localhost:4444",
    iceServers: [],
    dispatch: (action) => actions.push(action),
    mediaDevices: { getUserMedia },
    createSignaling: (url) =>
      new SignalingClient(url, () => {
        const socket = new Socket();
        sockets.push(socket);
        return socket;
      }),
    createPeer: (...args) => {
      const peer = new Peer();
      peers.push(peer);
      peerArgs.push(args);
      return peer as unknown as PeerLike;
    },
    sounds,
    now: () => Date.now(),
    createAudioContext: null,
    objectUrls,
    ...overrides,
  });
  sessions.push(session);
  const types = () => actions.map((action) => action.type);
  const last = <T extends OmniAction["type"]>(type: T) =>
    actions.filter((action) => action.type === type).at(-1) as Extract<OmniAction, { type: T }>;
  const all = <T extends OmniAction["type"]>(type: T) =>
    actions.filter((action) => action.type === type) as Extract<OmniAction, { type: T }>[];
  const systemKeys = () => all("system").map((action) => action.message.key);
  return {
    session,
    sockets,
    peers,
    peerArgs,
    actions,
    types,
    last,
    all,
    systemKeys,
    getUserMedia,
    sounds,
    objectUrls,
  };
}

async function connect(env: ReturnType<typeof setup>, mode: "create" | "join", password = "") {
  const started = env.session.start({ mode, code: mode === "join" ? "K7Q2M9" : "", password });
  await vi.advanceTimersByTimeAsync(0);
  env.sockets[0]!.open();
  await started;
  return env.sockets[0]!;
}

async function intoCall(env: ReturnType<typeof setup>, password = "") {
  const socket = await connect(env, "create", password);
  socket.message({ type: "created", code: "K7Q2M9", custom: false });
  socket.message({
    type: "signal",
    payload: { type: "description", sdp: { type: "offer", sdp: "v=0" } },
  });
  socket.message({ type: "peer-joined" });
  await vi.advanceTimersByTimeAsync(0);
  return { socket, peer: env.peers[0]! };
}

async function secureCall(env: ReturnType<typeof setup>) {
  const call = await intoCall(env);
  call.peer.sharedKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  call.peer.fire("secure-channel-ready", { safety: { emoji: "", code: "" } });
  return call;
}

async function incoming(key: CryptoKey, data: Uint8Array, fileId = 9, name = "cat.png") {
  const meta: FileMetadata = {
    type: "file-meta",
    fileId,
    name,
    size: data.byteLength,
    mimeType: "image/png",
    hash: await sha256(data),
    chunks: Math.ceil(data.byteLength / CHUNK_SIZE),
  };
  const frames: ArrayBuffer[] = [];
  for (let index = 0; index * CHUNK_SIZE < data.byteLength; index++) {
    const chunk = data.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    frames.push(encodeFileFrame(fileId, index, await encrypt(key, chunk)));
  }
  return { meta, frames };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("alertForError", () => {
  it("maps server and client errors to translated alerts", () => {
    expect(alertForError("Room not found.").key).toBe("err.room_not_found");
    expect(alertForError("Room is full.").key).toBe("err.room_full");
    expect(alertForError("Code already in use.").key).toBe("err.code_in_use");
    expect(alertForError("Custom code must be at least 4 characters.").key).toBe(
      "err.custom_length",
    );
    expect(alertForError("Connection timed out")).toMatchObject({
      key: "err.timeout",
      retry: true,
    });
    expect(alertForError("Could not reach signalling server").key).toBe("err.no_server");
    expect(alertForError("Signalling connection closed before opening").key).toBe("err.no_server");
    expect(alertForError("Server busy")).toMatchObject({ key: "alert.error", text: "Server busy" });
  });
});

describe("OmniSession", () => {
  it("creates a room, starts the call on peer-joined and flushes queued signals", async () => {
    const env = setup();
    const { socket, peer } = await intoCall(env);
    expect(socket.sent[0]).toEqual({ type: "create", code: "" });
    expect(env.types().slice(0, 4)).toEqual([
      "media-request",
      "media-ready",
      "connecting",
      "lobby-open",
    ]);
    expect(env.last("lobby-open")).toMatchObject({
      code: "K7Q2M9",
      status: { key: "lobby.waiting" },
    });
    expect(env.last("lobby-status").status.key).toBe("lobby.peer_found");
    expect(env.sounds.playJoinTone).toHaveBeenCalled();
    expect(env.last("call-start").code).toBe("K7Q2M9");
    expect(peer.initialize).toHaveBeenCalled();
    expect(peer.handleSignal).toHaveBeenCalledWith({
      type: "description",
      sdp: { type: "offer", sdp: "v=0" },
    });
    socket.message({
      type: "signal",
      payload: { type: "ice-candidate", candidate: { candidate: "c" } },
    });
    expect(peer.handleSignal).toHaveBeenCalledTimes(2);
  });

  it("announces a custom code and a recreated room", async () => {
    const env = setup();
    const socket = await connect(env, "create");
    socket.message({ type: "created", code: "MYROOM", custom: true });
    expect(env.last("lobby-open").status.key).toBe("lobby.custom_ready");
    socket.message({ type: "created", code: "NEW123", custom: false });
    expect(env.last("lobby-open").status.key).toBe("lobby.new_room");
  });

  it("joins as the responder", async () => {
    const env = setup();
    const socket = await connect(env, "join", "secret");
    expect(socket.sent[0]).toEqual({ type: "join", code: "K7Q2M9" });
    socket.message({ type: "joined", code: "K7Q2M9" });
    await vi.advanceTimersByTimeAsync(0);
    expect(env.peers).toHaveLength(1);
    expect(env.peerArgs[0]).toEqual([expect.anything(), false, [], "secret"]);
    expect(env.last("call-start").code).toBe("K7Q2M9");
  });

  it("fails the join with the server's error and releases everything", async () => {
    const env = setup();
    const socket = await connect(env, "join");
    socket.message({ type: "error", message: "Room not found." });
    expect(env.last("reset").alert?.key).toBe("err.room_not_found");
    expect(socket.close).toHaveBeenCalled();
  });

  it("times out after 30 s with a retryable alert", async () => {
    const env = setup();
    const started = env.session.start({ mode: "create", code: "", password: "" });
    await vi.advanceTimersByTimeAsync(30_000);
    await started;
    expect(env.last("reset").alert).toMatchObject({ key: "err.timeout", retry: true });
  });

  it("treats a closed socket while waiting for the room as no server", async () => {
    const env = setup();
    const socket = await connect(env, "join");
    socket.close();
    expect(env.last("reset").alert?.key).toBe("err.no_server");
  });

  it("falls back to audio only, or reports blocked media", async () => {
    const env = setup();
    env.getUserMedia.mockRejectedValueOnce(new Error("NotFound"));
    await connect(env, "create");
    expect(env.last("media-ready").hasVideo).toBe(false);

    const blocked = setup();
    blocked.getUserMedia.mockRejectedValue(new Error("NotAllowed"));
    await blocked.session.start({ mode: "create", code: "", password: "" });
    expect(blocked.last("reset").alert?.key).toBe("err.media_blocked");
    expect(blocked.types()).not.toContain("connecting");

    const none = setup({ mediaDevices: {} as MediaDevices });
    await none.session.start({ mode: "create", code: "", password: "" });
    expect(none.last("reset").alert?.key).toBe("err.media_blocked");
  });

  it("drops media that arrives after cancel", async () => {
    const env = setup();
    let resolve!: (stream: MediaStream) => void;
    const stream = new Stream([new Track("audio")]);
    env.getUserMedia.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const started = env.session.start({ mode: "create", code: "", password: "" });
    env.session.cancel();
    resolve(stream as unknown as MediaStream);
    await started;
    expect(stream.tracks[0]!.stop).toHaveBeenCalled();
    expect(env.sockets).toHaveLength(0);
  });

  it("recovers the lobby: reconnecting, rejoin-failed, reconnect-failed", async () => {
    const env = setup();
    const socket = await connect(env, "create");
    socket.message({ type: "created", code: "K7Q2M9", custom: false });
    socket.close();
    expect(env.last("lobby-status").status).toEqual({
      key: "lobby.reconnecting",
      params: { attempt: 1, max: 6 },
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const second = env.sockets[1]!;
    second.open();
    expect(second.sent[0]).toEqual({ type: "rejoin", code: "K7Q2M9" });
    second.message({ type: "rejoined", code: "K7Q2M9", custom: false });
    expect(env.last("lobby-open").status.key).toBe("lobby.reconnected");
    second.message({ type: "rejoin-failed", code: "K7Q2M9" });
    expect(env.last("lobby-status").status.key).toBe("lobby.session_expired");
    expect(second.sent.at(-1)).toEqual({ type: "create", code: "" });
    second.message({ type: "error", message: "Server busy" });
    expect(env.types()).not.toContain("reset");

    for (let attempt = 0; attempt <= 6; attempt++) {
      env.sockets.at(-1)!.close();
      await vi.advanceTimersByTimeAsync(31_000);
    }
    expect(env.last("reset").alert?.key).toBe("err.reconnect_failed");
  });

  it("ends the call 3 s after the peer leaves", async () => {
    const env = setup();
    const { socket, peer } = await intoCall(env);
    socket.message({ type: "peer-left" });
    expect(env.last("ending").key).toBe("end.peer_left");
    expect(env.sounds.playHangupTone).toHaveBeenCalled();
    socket.message({ type: "peer-left" });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(env.last("reset").alert).toEqual({ tone: "info", key: "end.peer_left" });
    expect(peer.hangup).toHaveBeenCalled();
  });

  it("verifies the password: wrong password ends the call, __verified clears it", async () => {
    const env = setup();
    const { peer } = await intoCall(env, "secret");
    expect(env.peerArgs[0]).toEqual([expect.anything(), true, [], "secret"]);
    peer.fire("secure-channel-ready", { safety: { emoji: "🦊", code: "3F9A C21E" } });
    expect(env.last("secure").safety.code).toBe("3F9A C21E");
    expect(peer.send).toHaveBeenCalledWith({ type: "__verify" });
    peer.fire("data", { type: "__verify" });
    expect(peer.send).toHaveBeenCalledWith({ type: "__verified" });
    await vi.advanceTimersByTimeAsync(7_000);
    expect(env.last("ending").key).toBe("end.wrong_password");
    await vi.advanceTimersByTimeAsync(2_500);
    expect(env.last("reset").alert?.key).toBe("end.wrong_password");

    const ok = setup();
    const call = await intoCall(ok, "secret");
    call.peer.fire("secure-channel-ready", { safety: { emoji: "", code: "" } });
    call.peer.fire("data", { type: "__verified" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ok.types()).not.toContain("ending");
  });

  it("reports connection state, remote media and peer errors", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    peer.fire("remote-stream", { stream: "remote" });
    expect(env.last("remote").stream).toBe("remote");
    peer.fire("ice-state", { state: "connected" });
    expect(env.last("connection").state).toBe("connected");
    peer.fire("ice-state", { state: "disconnected" });
    expect(env.last("connection").state).toBe("reconnecting");
    peer.fire("ice-restarting");
    peer.fire("ice-state", { state: "failed" });
    expect(env.last("connection").state).toBe("failed");
    peer.fire("ice-state", { state: "checking" });
    peer.fire("error", { message: "boom" });
    expect(env.last("notice").text).toBe("boom");
  });

  it("polls stats into quality and link type, and adapts the send quality", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    peer.stats = [
      {
        type: "inbound-rtp",
        kind: "video",
        bytesReceived: 0,
        packetsLost: 0,
        packetsReceived: 100,
      },
      { type: "remote-inbound-rtp", kind: "video", roundTripTime: 0.05 },
      {
        type: "candidate-pair",
        state: "succeeded",
        nominated: true,
        localCandidateId: "l",
        remoteCandidateId: "r",
        currentRoundTripTime: 0.05,
      },
      { type: "local-candidate", id: "l", candidateType: "host" },
      { type: "remote-candidate", id: "r", candidateType: "srflx" },
    ];
    peer.fire("ice-state", { state: "connected" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(env.types()).not.toContain("stats");
    peer.stats[0] = {
      ...peer.stats[0],
      bytesReceived: 50_000,
      packetsLost: 30,
      packetsReceived: 100,
    };
    await vi.advanceTimersByTimeAsync(2_000);
    const stats = env.last("stats");
    expect(stats.quality).toBe("poor");
    expect(peer.setSendQuality).toHaveBeenCalledWith("poor");
    const count = env.types().filter((type) => type === "stats").length;
    peer.stats[0] = { ...peer.stats[0], bytesReceived: 100_000 };
    await vi.advanceTimersByTimeAsync(2_000);
    // identical stats are not re-dispatched
    expect(env.types().filter((type) => type === "stats").length).toBe(count);
  });

  it("judges audio-only calls by loss and round trip", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    peer.stats = [{ type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.04 }];
    peer.fire("ice-state", { state: "completed" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(env.last("stats")).toMatchObject({ quality: "good", label: "0.0% loss · 40ms" });
    peer.pc!.getStats.mockRejectedValueOnce(new Error("closed"));
    await vi.advanceTimersByTimeAsync(2_000);
  });

  it("controls: mic, camera, flip and the safety check", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    env.session.toggleMic();
    expect(env.last("mic").on).toBe(false);
    env.session.toggleCam();
    expect(env.last("cam").on).toBe(false);
    await env.session.flip();
    expect(env.getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: "environment" },
      audio: false,
    });
    expect(peer.replaceVideoTrack).toHaveBeenCalled();
    expect(env.last("local-tracks").facing).toBe("environment");
    env.getUserMedia.mockRejectedValueOnce(new Error("busy"));
    await env.session.flip();
    expect(env.last("local-tracks").facing).toBe("environment");

    env.session.confirmSas();
    expect(env.last("sas-close")).toBeDefined();
    env.session.rejectSas();
    expect(env.last("ending").key).toBe("end.sas_mismatch");
    await vi.advanceTimersByTimeAsync(800);
    expect(env.last("reset").alert?.key).toBe("end.sas_mismatch");
  });

  it("ignores the camera toggle without video", async () => {
    const env = setup();
    env.getUserMedia.mockRejectedValueOnce(new Error("NotFound"));
    await connect(env, "create");
    env.session.toggleCam();
    await env.session.flip();
    expect(env.types()).not.toContain("cam");
  });

  it("nudges at most once per 4 s while muted and talking", async () => {
    const env = setup();
    await intoCall(env);
    const levels: number[] = [];
    env.session.setLevelListener((level) => levels.push(level));
    env.session.onLevel(0.2);
    expect(env.types()).not.toContain("nudge");
    env.session.toggleMic();
    env.session.onLevel(0.05);
    env.session.onLevel(0.2);
    env.session.onLevel(0.2);
    expect(env.actions.filter((a) => a.type === "nudge" && a.on)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(env.last("nudge").on).toBe(false);
    await vi.advanceTimersByTimeAsync(1_100);
    env.session.onLevel(0.2);
    expect(env.actions.filter((a) => a.type === "nudge" && a.on)).toHaveLength(2);
    expect(levels[0]).toBeCloseTo(0.6);
  });

  it("runs the mic meter on Web Audio and stops it on hang-up", async () => {
    const close = vi.fn(async () => undefined);
    const analyser = {
      fftSize: 0,
      getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(160),
    };
    const ctx = {
      createAnalyser: () => analyser,
      createMediaStreamSource: () => ({ connect: vi.fn() }),
      close,
    };
    vi.stubGlobal("MediaStream", class {});
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 7),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const env = setup({ createAudioContext: () => ctx as unknown as AudioContext });
    const levels: number[] = [];
    env.session.setLevelListener((level) => levels.push(level));
    const { peer } = await intoCall(env);
    peer.fire("secure-channel-ready", { safety: { emoji: "", code: "" } });
    expect(analyser.fftSize).toBe(512);
    expect(levels.at(-1)).toBeCloseTo(0.75);
    const mic = (await env.getUserMedia.mock.results[0]!.value).getAudioTracks()[0] as Track;
    expect(mic.clones).toHaveLength(1);
    env.session.toggleMic();
    expect(mic.enabled).toBe(false);
    expect(mic.clones[0]!.enabled).toBe(true);
    env.session.hangup();
    expect(mic.clones[0]!.stop).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(close).toHaveBeenCalled();
    expect(env.last("reset").alert ?? null).toBeNull();
  });

  it("survives a meter that can't start", async () => {
    const env = setup({
      createAudioContext: () => {
        throw new Error("no audio");
      },
    });
    const { peer } = await intoCall(env);
    expect(() =>
      peer.fire("secure-channel-ready", { safety: { emoji: "", code: "" } }),
    ).not.toThrow();
  });

  it("alerts when the peer connection can't initialise", async () => {
    const env = setup({
      createPeer: () => {
        const peer = new Peer();
        peer.initialize.mockRejectedValueOnce(new Error("no RTCPeerConnection"));
        return peer as unknown as PeerLike;
      },
    });
    await intoCall(env);
    expect(env.last("notice").text).toBe("no RTCPeerConnection");
    expect(env.last("reset").alert?.key).toBe("err.connect_failed");
  });

  it("sends and receives chat once the channel is secure", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    expect(await env.session.sendChat("too early")).toBe(false);
    expect(env.systemKeys()).toContain("sys.send_failed_notready");
    expect(peer.send).not.toHaveBeenCalledWith({ type: "chat", text: "too early" });

    peer.sharedKey = {} as CryptoKey;
    peer.fire("secure-channel-ready", { safety: { emoji: "", code: "" } });
    expect(env.systemKeys()).toContain("sys.channel_ready");
    expect(await env.session.sendChat("   ")).toBe(false);
    expect(await env.session.sendChat(`  hi ${"x".repeat(5_000)}`)).toBe(true);
    const sent = peer.send.mock.calls.at(-1)![0] as unknown as { text: string };
    expect(sent.text).toHaveLength(4_000);
    expect(env.last("chat")).toMatchObject({ from: "me", text: sent.text });

    peer.fire("data", { type: "chat", text: "y".repeat(4_500) });
    expect(env.last("chat")).toMatchObject({ from: "peer", text: "y".repeat(4_000) });
    expect(env.sounds.playMessageTone).toHaveBeenCalledTimes(1);

    peer.send.mockRejectedValueOnce(new Error("closed"));
    expect(await env.session.sendChat("lost")).toBe(false);
    expect(env.all("chat")).toHaveLength(2);
  });

  it("throttles outgoing typing and hides the peer's indicator after 3 s", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    env.session.typing();
    expect(peer.send).not.toHaveBeenCalledWith({ type: "typing" });
    peer.sharedKey = {} as CryptoKey;
    env.session.typing();
    env.session.typing();
    const typingSends = () =>
      peer.send.mock.calls.filter((call) => JSON.stringify(call) === '[{"type":"typing"}]').length;
    expect(typingSends()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    env.session.typing();
    expect(typingSends()).toBe(2);

    peer.fire("data", { type: "typing" });
    expect(env.last("typing").on).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    peer.fire("data", { type: "typing" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(env.last("typing").on).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(env.last("typing").on).toBe(false);

    peer.fire("data", { type: "typing" });
    peer.fire("data", { type: "chat", text: "done" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(env.all("typing").filter((action) => !action.on)).toHaveLength(1);
  });

  it("sends files concurrently with progress, and reports failures", async () => {
    const env = setup();
    const { peer } = await secureCall(env);
    let finish!: () => void;
    peer.sendFile.mockImplementationOnce(
      (file: File, { fileId }: { fileId: number }) =>
        new Promise<undefined>((resolve) => {
          peer.fire("file-send-progress", { fileId, name: file.name, sent: 1, total: 3 });
          peer.fire("file-send-progress", { fileId, name: file.name, sent: 1, total: 3 });
          finish = () => resolve(undefined);
        }),
    );
    peer.sendFile.mockRejectedValueOnce(new Error("channel closed"));
    const big = new File([new Uint8Array(CHUNK_SIZE * 2 + 1)], "big.bin");
    env.session.sendFiles([big, new File(["x"], "small.txt")]);

    const starts = env.all("transfer-start");
    expect(starts.map((action) => action.transfer)).toMatchObject([
      { direction: "out", name: "big.bin", total: 3 },
      { direction: "out", name: "small.txt", total: 1 },
    ]);
    expect(
      env
        .all("system")
        .slice(-2)
        .map((action) => action.message),
    ).toEqual([
      { key: "sys.sending", params: { name: "big.bin", size: "128.0 KB" } },
      { key: "sys.sending", params: { name: "small.txt", size: "1 B" } },
    ]);
    const [bigId, smallId] = peer.sendFile.mock.calls.map(([, options]) => options.fileId);
    expect(bigId).not.toBe(smallId);
    expect(starts[0]!.transfer.key).toBe(`out:${bigId}`);
    expect(env.all("transfer-progress")).toEqual([
      { type: "transfer-progress", key: `out:${bigId}`, done: 1 },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(env.last("transfer-failed").key).toBe(`out:${smallId}`);
    expect(env.last("system").message).toEqual({
      key: "sys.send_failed",
      params: { error: "channel closed" },
    });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.last("transfer-done")).toMatchObject({ key: `out:${bigId}`, url: null });
    expect(env.last("system").message).toEqual({ key: "sys.sent", params: { name: "big.bin" } });
  });

  it("sends at most SEND_CONCURRENCY files at once so the receiver never refuses one", async () => {
    const env = setup();
    const { peer } = await secureCall(env);
    const done: (() => void)[] = [];
    peer.sendFile.mockImplementation(
      () => new Promise<undefined>((resolve) => done.push(() => resolve(undefined))),
    );
    const files = Array.from({ length: 20 }, (_, i) => new File(["x"], `f${i}.txt`));
    env.session.sendFiles(files);
    expect(env.all("transfer-start")).toHaveLength(20);
    expect(peer.sendFile).toHaveBeenCalledTimes(SEND_CONCURRENCY);
    expect(SEND_CONCURRENCY).toBeLessThan(MAX_INCOMING);
    done[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.sendFile).toHaveBeenCalledTimes(SEND_CONCURRENCY + 1);
    expect(peer.sendFile.mock.calls.at(-1)![0].name).toBe(`f${SEND_CONCURRENCY}.txt`);
    for (let i = 1; i < 20; i++) {
      await vi.waitFor(() => expect(done[i]).toBeDefined());
      done[i]!();
    }
    await vi.waitFor(() => expect(env.all("transfer-done")).toHaveLength(20));

    peer.sendFile.mockClear();
    env.session.sendFiles(files.slice(0, 6));
    env.session.hangup();
    done.at(-1)!();
    await vi.advanceTimersByTimeAsync(0);
    expect(peer.sendFile).toHaveBeenCalledTimes(SEND_CONCURRENCY);
  });

  it("refuses to send files before the channel is secure", async () => {
    const env = setup();
    const { peer } = await intoCall(env);
    env.session.sendFiles([new File(["x"], "a.txt")]);
    env.session.sendFiles([]);
    expect(peer.sendFile).not.toHaveBeenCalled();
    expect(env.systemKeys().filter((key) => key === "sys.send_failed_notready")).toHaveLength(1);
  });

  it("receives a verified file into an object URL, revoked on clear and hang-up", async () => {
    const env = setup();
    const { peer } = await secureCall(env);
    const data = new Uint8Array(CHUNK_SIZE + 5).fill(3);
    const file = await incoming(peer.sharedKey!, data, 9, "../cat.png");
    peer.fire("data", file.meta);
    expect(env.last("transfer-start").transfer).toEqual({
      key: "in:9",
      direction: "in",
      name: "cat.png",
      size: data.byteLength,
      total: 2,
    });
    expect(env.last("system").message.key).toBe("sys.rx_receiving");
    for (const frame of file.frames) peer.fire("file-chunk", { data: frame });
    await vi.waitFor(() => expect(env.last("transfer-done")).toBeDefined());
    expect(env.last("transfer-progress")).toEqual({
      type: "transfer-progress",
      key: "in:9",
      done: 1,
    });
    expect(env.last("transfer-done")).toMatchObject({
      key: "in:9",
      url: "blob:test/1",
      preview: "image",
    });
    const blob = env.objectUrls.createObjectURL.mock.calls[0]![0];
    expect(blob.type).toBe("application/octet-stream");

    const starts = env.all("transfer-start").length;
    peer.fire("data", file.meta);
    expect(env.all("transfer-start")).toHaveLength(starts);
    expect(env.last("notice").text).toBe("Duplicate file ID");

    env.session.clearChat();
    expect(env.objectUrls.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(env.last("chat-clear")).toBeDefined();

    const second = await incoming(peer.sharedKey!, new Uint8Array([1, 2, 3]), 10, "b.png");
    peer.fire("data", second.meta);
    peer.fire("file-chunk", { data: second.frames[0]! });
    await vi.waitFor(() => expect(env.objectUrls.createObjectURL).toHaveBeenCalledTimes(2));
    env.session.hangup();
    expect(env.objectUrls.revokeObjectURL).toHaveBeenCalledWith("blob:test/2");
  });

  it("reports integrity failures, oversized files and refused transfers", async () => {
    const env = setup();
    const { peer } = await secureCall(env);
    const file = await incoming(peer.sharedKey!, new Uint8Array([1, 2, 3]), 4);
    peer.fire("data", { ...file.meta, hash: "0".repeat(64) });
    peer.fire("file-chunk", { data: file.frames[0]! });
    await vi.waitFor(() => expect(env.last("transfer-failed")).toBeDefined());
    expect(env.last("transfer-failed").key).toBe("in:4");
    expect(env.last("system").message).toEqual({
      key: "sys.integrity_fail",
      params: { name: "cat.png" },
    });
    expect(env.objectUrls.createObjectURL).not.toHaveBeenCalled();

    peer.fire("data", { ...file.meta, fileId: 5, size: 600 * 1024 * 1024, chunks: 19_200 });
    expect(env.last("system").message).toMatchObject({
      key: "sys.rx_large",
      params: { size: "600.0 MB" },
    });
    const starts = env.all("transfer-start").length;
    peer.fire("data", { ...file.meta, fileId: 5 });
    expect(env.all("transfer-start")).toHaveLength(starts);
    expect(env.last("notice").text).toMatch(/./);
  });

  it("hangs up and disposes: tracks stop, socket closes, sounds released", async () => {
    const env = setup();
    const { socket, peer } = await intoCall(env);
    const stream = env.last("media-ready").stream as unknown as Stream;
    env.session.dispose();
    expect(peer.hangup).toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
    expect(stream.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(env.sounds.dispose).toHaveBeenCalled();
  });
});

describe("OmniSession screen sharing", () => {
  function withDisplay(display = vi.fn(async () => new Stream([new Track("video")]))) {
    const getUserMedia = vi.fn(
      async (constraints: MediaStreamConstraints) =>
        new Stream(
          constraints.video ? [new Track("audio"), new Track("video")] : [new Track("audio")],
        ) as unknown as MediaStream,
    );
    const env = setup({
      mediaDevices: {
        getUserMedia,
        getDisplayMedia: display as unknown as MediaDevices["getDisplayMedia"],
      },
    });
    return { env, display, getUserMedia };
  }

  it("sends the screen instead of the camera, and switches back on stop", async () => {
    const { env, display, getUserMedia } = withDisplay();
    const { peer } = await secureCall(env);
    const camera = (env.last("media-ready").stream as unknown as Stream).getVideoTracks()[0]!;
    await env.session.toggleScreen();
    expect(display).toHaveBeenCalledWith({ video: true, audio: false });
    const shared = env.last("screen").stream as unknown as Stream;
    const screenTrack = shared.getVideoTracks()[0]!;
    expect(peer.replaceVideoTrack).toHaveBeenLastCalledWith(screenTrack);

    // No flipping while sharing (as in the original).
    await env.session.flip();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await env.session.toggleScreen();
    expect(screenTrack.stop).toHaveBeenCalled();
    expect(env.last("screen").stream).toBeNull();
    expect(peer.replaceVideoTrack).toHaveBeenLastCalledWith(camera);
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it("switches back when the browser's own Stop sharing ends the track", async () => {
    const { env } = withDisplay();
    const { peer } = await secureCall(env);
    await env.session.toggleScreen();
    const track = (env.last("screen").stream as unknown as Stream).getVideoTracks()[0]!;
    track.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.last("screen").stream).toBeNull();
    expect(peer.replaceVideoTrack).toHaveBeenCalledTimes(2);
  });

  it("stays on the camera when the picker is cancelled or the call ends meanwhile", async () => {
    const cancel = vi.fn(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    const { env } = withDisplay(cancel as never);
    const { peer } = await secureCall(env);
    await env.session.toggleScreen();
    expect(env.all("screen")).toHaveLength(0);
    expect(peer.replaceVideoTrack).not.toHaveBeenCalled();

    let resolve!: (stream: MediaStream) => void;
    const slow = vi.fn(() => new Promise<MediaStream>((r) => (resolve = r)));
    const second = withDisplay(slow as never);
    await secureCall(second.env);
    const pending = second.env.session.toggleScreen();
    // A second click while the picker is open is ignored.
    await second.env.session.toggleScreen();
    expect(slow).toHaveBeenCalledTimes(1);
    second.env.session.hangup();
    const display = new Stream([new Track("video")]);
    resolve(display as unknown as MediaStream);
    await pending;
    expect(display.tracks[0]!.stop).toHaveBeenCalled();
    expect(second.env.all("screen")).toHaveLength(0);
  });

  it("reports unsupported browsers and does nothing outside a call", async () => {
    const env = setup();
    await env.session.toggleScreen();
    expect(env.systemKeys()).toEqual([]);
    await secureCall(env);
    await env.session.toggleScreen();
    expect(env.systemKeys()).toContain("sys.screen_unsupported");
  });

  it("stops the shared screen when the call ends", async () => {
    const { env } = withDisplay();
    await secureCall(env);
    await env.session.toggleScreen();
    const track = (env.last("screen").stream as unknown as Stream).getVideoTracks()[0]!;
    env.session.hangup();
    expect(track.stop).toHaveBeenCalled();
  });

  it("shows a replace failure and releases the screen", async () => {
    const { env } = withDisplay();
    const { peer } = await secureCall(env);
    peer.replaceVideoTrack.mockRejectedValueOnce(new Error("no sender"));
    await env.session.toggleScreen();
    expect(env.last("notice").text).toBe("no sender");
    expect(env.all("screen")).toHaveLength(0);
  });
});

describe("OmniSession recording", () => {
  function recorderModule(options: { supported?: boolean; startError?: Error } = {}) {
    const instances: {
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      setLocal: ReturnType<typeof vi.fn>;
    }[] = [];
    const blob = new Blob(["webm"], { type: "video/webm" });
    const mod = {
      isRecordingSupported: vi.fn(() => options.supported ?? true),
      recordingName: vi.fn((code: string) => `omni-${code}.webm`),
      saveRecording: vi.fn(async () => "saved" as const),
      CallRecorder: class {
        start = vi.fn(() => {
          if (options.startError) throw options.startError;
        });
        stop = vi.fn(async (): Promise<Blob | null> => blob);
        setLocal = vi.fn();
        constructor() {
          instances.push(this);
        }
      },
    };
    return { mod, instances, blob };
  }

  it("records locally, then stops and saves the file with the room code", async () => {
    const { mod, instances, blob } = recorderModule();
    const env = setup({ loadRecorder: async () => mod as never });
    const { peer } = await secureCall(env);
    const remote = new Stream([new Track("video"), new Track("audio")]);
    peer.fire("remote-stream", { stream: remote });
    await env.session.toggleRecording();
    const local = env.last("media-ready").stream;
    expect(instances[0]!.start).toHaveBeenCalledWith({ remote, local, audio: [local, remote] });
    expect(env.last("recording").on).toBe(true);
    expect(env.systemKeys()).toContain("sys.record_started");

    await env.session.toggleRecording();
    expect(env.last("recording").on).toBe(false);
    expect(mod.saveRecording).toHaveBeenCalledWith(blob, "omni-K7Q2M9.webm");
    expect(env.last("system").message).toEqual({
      key: "sys.record_saved",
      params: { size: "4 B" },
    });
    // Nothing about the recording is sent to the peer.
    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "recording" }));
  });

  it("follows the screen share in the corner picture", async () => {
    const { mod, instances } = recorderModule();
    const display = new Stream([new Track("video")]);
    const env = setup({
      loadRecorder: async () => mod as never,
      mediaDevices: {
        getUserMedia: async () =>
          new Stream([new Track("audio"), new Track("video")]) as unknown as MediaStream,
        getDisplayMedia: async () => display as unknown as MediaStream,
      },
    });
    await secureCall(env);
    await env.session.toggleRecording();
    await env.session.toggleScreen();
    expect(instances[0]!.setLocal).toHaveBeenLastCalledWith(display);
    await env.session.toggleScreen();
    expect(instances[0]!.setLocal).toHaveBeenLastCalledWith(env.last("media-ready").stream);
  });

  it("saves the recording when the call ends", async () => {
    const { mod, instances } = recorderModule();
    const env = setup({ loadRecorder: async () => mod as never });
    await secureCall(env);
    await env.session.toggleRecording();
    env.session.hangup();
    expect(instances[0]!.stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(mod.saveRecording).toHaveBeenCalledTimes(1);
    expect(env.systemKeys()).not.toContain("sys.record_saved");
  });

  it("reports unsupported browsers, start errors, load errors and empty recordings", async () => {
    const unsupported = recorderModule({ supported: false });
    const env = setup({ loadRecorder: async () => unsupported.mod as never });
    await env.session.toggleRecording();
    expect(unsupported.mod.isRecordingSupported).not.toHaveBeenCalled();
    await secureCall(env);
    await env.session.toggleRecording();
    expect(env.systemKeys()).toContain("sys.record_unsupported");

    const failing = recorderModule({ startError: new Error("no codec") });
    const env2 = setup({ loadRecorder: async () => failing.mod as never });
    await secureCall(env2);
    await env2.session.toggleRecording();
    expect(env2.last("system").message).toEqual({
      key: "sys.record_error",
      params: { error: "no codec" },
    });
    expect(env2.all("recording")).toHaveLength(0);

    const env3 = setup({
      loadRecorder: async () => {
        throw new Error("chunk failed");
      },
    });
    await secureCall(env3);
    await env3.session.toggleRecording();
    expect(env3.last("system").message.params).toEqual({ error: "chunk failed" });

    const empty = recorderModule();
    const env4 = setup({ loadRecorder: async () => empty.mod as never });
    await secureCall(env4);
    await env4.session.toggleRecording();
    empty.instances[0]!.stop.mockResolvedValueOnce(null);
    await env4.session.toggleRecording();
    expect(env4.systemKeys()).toContain("sys.record_nodata");
    expect(empty.mod.saveRecording).not.toHaveBeenCalled();
  });

  it("shows a save failure, and stays quiet when the save picker is cancelled", async () => {
    const { mod } = recorderModule();
    const env = setup({ loadRecorder: async () => mod as never });
    await secureCall(env);
    await env.session.toggleRecording();
    mod.saveRecording.mockResolvedValueOnce("cancelled" as never);
    await env.session.toggleRecording();
    expect(env.systemKeys()).not.toContain("sys.record_saved");
    await env.session.toggleRecording();
    mod.saveRecording.mockRejectedValueOnce(new Error("disk full"));
    await env.session.toggleRecording();
    expect(env.last("notice").text).toBe("disk full");
  });
});

describe("OmniSession announce", () => {
  it("adds browser-feature messages to the log only during a call", async () => {
    const env = setup();
    env.session.announce({ key: "sys.pip_unsupported" });
    expect(env.systemKeys()).toEqual([]);
    await secureCall(env);
    env.session.announce({ key: "sys.pip_unsupported" });
    expect(env.systemKeys()).toContain("sys.pip_unsupported");
  });
});
