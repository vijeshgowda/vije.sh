import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OmniEvents } from "./core/events";
import { SignalingClient, type SignalingSocket } from "./core/signaling";
import { OmniSession, alertForError, type PeerLike, type SessionDeps } from "./session";
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
  constructor(readonly kind: "audio" | "video") {}
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
  initialize = vi.fn(async () => {
    this.pc = { getStats: vi.fn(async () => this.stats) };
  });
  handleSignal = vi.fn(async () => undefined);
  send = vi.fn(async () => undefined);
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
    playHangupTone: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
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
    createPeer: () => {
      const peer = new Peer();
      peers.push(peer);
      return peer as unknown as PeerLike;
    },
    sounds,
    now: () => Date.now(),
    createAudioContext: null,
    ...overrides,
  });
  sessions.push(session);
  const types = () => actions.map((action) => action.type);
  const last = <T extends OmniAction["type"]>(type: T) =>
    actions.filter((action) => action.type === type).at(-1) as Extract<OmniAction, { type: T }>;
  return { session, sockets, peers, actions, types, last, getUserMedia, sounds };
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
    const socket = await connect(env, "join");
    expect(socket.sent[0]).toEqual({ type: "join", code: "K7Q2M9" });
    socket.message({ type: "joined", code: "K7Q2M9" });
    await vi.advanceTimersByTimeAsync(0);
    expect(env.peers).toHaveLength(1);
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
    await vi.advanceTimersByTimeAsync(2_000);
    expect(env.types().filter((type) => type === "stats").length).toBeGreaterThanOrEqual(count);
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
    env.session.hangup();
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
