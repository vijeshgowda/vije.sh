import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CallRecorder,
  coverRect,
  isRecordingSupported,
  recordingName,
  saveRecording,
  type RecorderEnv,
} from "./recorder";

type FakeTrack = { kind: string; stop: ReturnType<typeof vi.fn> };
const track = (kind: string): FakeTrack => ({ kind, stop: vi.fn() });
function stream(...tracks: FakeTrack[]) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  } as unknown as MediaStream;
}

function fakeEnv(options: { supported?: string[]; mixFails?: boolean; noContext?: boolean } = {}) {
  const videos: {
    srcObject: MediaStream | null;
    muted: boolean;
    playsInline: boolean;
    videoWidth: number;
    videoHeight: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
  }[] = [];
  const draws: number[][] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn((...args: unknown[]) => draws.push(args.slice(1) as number[])),
  };
  const canvasTrack = track("video");
  const mixTrack = track("audio");
  const sources: MediaStream[] = [];
  const audio = {
    createMediaStreamDestination: () => ({ stream: stream(mixTrack) }),
    createMediaStreamSource: (source: MediaStream) => {
      if (options.mixFails) throw new Error("no");
      sources.push(source);
      return { connect: vi.fn() };
    },
    close: vi.fn(async () => undefined),
  };
  const frames: (() => void)[] = [];
  const recorder = {
    mimeType: "video/webm;codecs=vp8,opus",
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(function (this: { onstop: (() => void) | null }) {
      this.onstop?.();
    }),
  };
  let recorded: { tracks: FakeTrack[]; options?: MediaRecorderOptions } | null = null;
  const env: RecorderEnv = {
    createVideo: () => {
      const video = {
        srcObject: null,
        muted: false,
        playsInline: false,
        videoWidth: 640,
        videoHeight: 480,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
      };
      videos.push(video);
      return video as unknown as HTMLVideoElement;
    },
    createCanvas: () =>
      ({
        width: 0,
        height: 0,
        getContext: () => (options.noContext ? null : ctx),
        captureStream: () => stream(canvasTrack),
      }) as unknown as HTMLCanvasElement,
    createAudioContext: () => audio as unknown as AudioContext,
    createRecorder: (s, o) => {
      recorded = { tracks: s.getTracks() as unknown as FakeTrack[], options: o };
      return recorder as unknown as MediaRecorder;
    },
    isTypeSupported: (type) => (options.supported ?? ["video/webm;codecs=vp8,opus"]).includes(type),
    createStream: (tracks) => stream(...(tracks as unknown as FakeTrack[])),
    requestFrame: (draw) => frames.push(draw),
    cancelFrame: vi.fn(),
  };
  return {
    env,
    videos,
    ctx,
    draws,
    audio,
    sources,
    frames,
    recorder,
    canvasTrack,
    mixTrack,
    recorded: () => recorded,
  };
}

describe("recording helpers", () => {
  it("names files after the room and time, without awkward characters", () => {
    const at = new Date("2026-11-01T13:06:06.105Z");
    expect(recordingName("K7Q2M9", at)).toBe("omni-K7Q2M9-2026-11-01T13-06-06.webm");
    expect(recordingName("../x y", at)).toBe("omni-xy-2026-11-01T13-06-06.webm");
    expect(recordingName("", at)).toBe("omni-call-2026-11-01T13-06-06.webm");
  });
  it("crops the source like object-fit: cover", () => {
    expect(coverRect(1920, 1080, 1280, 720)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
    expect(coverRect(640, 480, 1280, 720)).toEqual({ sx: 0, sy: 60, sw: 640, sh: 360 });
    expect(coverRect(480, 640, 320, 320)).toEqual({ sx: 0, sy: 80, sw: 480, sh: 480 });
  });
  it("needs MediaRecorder and canvas capture", () => {
    expect(isRecordingSupported()).toBe(false);
    vi.stubGlobal("MediaRecorder", class {});
    vi.stubGlobal("HTMLCanvasElement", class {});
    expect(isRecordingSupported()).toBe(false);
    vi.stubGlobal(
      "HTMLCanvasElement",
      class {
        captureStream() {}
      },
    );
    expect(isRecordingSupported()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("CallRecorder", () => {
  it("composites remote + local video, mixes both audio tracks and records WebM", async () => {
    const fake = fakeEnv();
    const mic = stream(track("audio"), track("video"));
    const remote = stream(track("video"), track("audio"));
    const recorder = new CallRecorder(fake.env);
    recorder.start({ remote, local: mic, audio: [mic, remote, null] });
    expect(recorder.recording).toBe(true);

    expect(fake.videos.map((video) => video.srcObject)).toEqual([remote, mic]);
    expect(fake.videos.every((video) => video.muted && video.playsInline)).toBe(true);
    // Remote fills the frame, local sits in the bottom-right corner with a border.
    expect(fake.draws[0]?.slice(4)).toEqual([0, 0, 1280, 720]);
    expect(fake.draws[1]?.slice(4)).toEqual([936, 456, 320, 240]);
    expect(fake.ctx.strokeRect).toHaveBeenCalledWith(936, 456, 320, 240);
    expect(fake.sources).toEqual([mic, remote]);
    expect(fake.recorded()).toEqual({
      tracks: [fake.canvasTrack, fake.mixTrack],
      options: { mimeType: "video/webm;codecs=vp8,opus" },
    });
    expect(fake.recorder.start).toHaveBeenCalledWith(1_000);

    fake.frames.at(-1)?.();
    expect(fake.draws).toHaveLength(4);

    fake.recorder.ondataavailable?.({ data: new Blob(["a"]) });
    fake.recorder.ondataavailable?.({ data: new Blob([]) });
    fake.recorder.ondataavailable?.({ data: new Blob(["b"]) });
    const blob = await recorder.stop();
    expect(blob?.type).toBe("video/webm;codecs=vp8,opus");
    expect(await blob?.text()).toBe("ab");
    expect(recorder.recording).toBe(false);
    expect(fake.canvasTrack.stop).toHaveBeenCalled();
    expect(fake.mixTrack.stop).toHaveBeenCalled();
    // The call's own tracks are never stopped by the recorder.
    mic.getTracks().forEach((t) => expect(t.stop).not.toHaveBeenCalled());
    expect(fake.audio.close).toHaveBeenCalled();
    expect(fake.videos.every((video) => video.srcObject === null)).toBe(true);
    expect(await recorder.stop()).toBeNull();
  });

  it("records video only when no audio can be mixed, and without a preferred type", async () => {
    const fake = fakeEnv({ supported: [], mixFails: true });
    const recorder = new CallRecorder(fake.env);
    recorder.start({
      remote: null,
      local: stream(track("video")),
      audio: [stream(track("audio"))],
    });
    recorder.start({ remote: null, local: null, audio: [] });
    expect(fake.recorded()).toEqual({ tracks: [fake.canvasTrack], options: undefined });
    expect(fake.videos).toHaveLength(1);
    expect(await recorder.stop()).toBeNull();
  });

  it("switches the corner picture to a new local source", async () => {
    const fake = fakeEnv();
    const recorder = new CallRecorder(fake.env);
    const camera = stream(track("video"));
    const screen = stream(track("video"));
    recorder.setLocal(screen);
    expect(fake.videos).toHaveLength(0);
    recorder.start({ remote: null, local: camera, audio: [] });
    recorder.setLocal(screen);
    expect(fake.videos[0]?.pause).toHaveBeenCalled();
    expect(fake.videos[1]?.srcObject).toBe(screen);
    await recorder.stop();
  });

  it("releases everything when it can't start", () => {
    const fake = fakeEnv({ noContext: true });
    expect(() =>
      new CallRecorder(fake.env).start({ remote: null, local: null, audio: [] }),
    ).toThrow("Canvas 2D");
    const failing = fakeEnv();
    failing.env.createRecorder = () => {
      throw new Error("NotSupportedError");
    };
    const recorder = new CallRecorder(failing.env);
    expect(() =>
      recorder.start({ remote: stream(track("video")), local: null, audio: [] }),
    ).toThrow("NotSupportedError");
    expect(recorder.recording).toBe(false);
    expect(failing.canvasTrack.stop).toHaveBeenCalled();
    expect(failing.audio.close).toHaveBeenCalled();
    expect(failing.videos[0]?.srcObject).toBeNull();
  });

  it("still resolves when MediaRecorder.stop throws", async () => {
    const fake = fakeEnv();
    fake.recorder.stop = vi.fn(() => {
      throw new Error("InvalidStateError");
    });
    const recorder = new CallRecorder(fake.env);
    recorder.start({ remote: null, local: null, audio: [] });
    fake.recorder.ondataavailable?.({ data: new Blob(["x"]) });
    expect(await (await recorder.stop())?.text()).toBe("x");
  });
});

describe("saveRecording", () => {
  const link = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    link.click.mockClear();
    vi.stubGlobal("document", { createElement: () => link, body: { append } });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:rec", revokeObjectURL: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("downloads through a link when there's no save picker, then revokes the URL", async () => {
    vi.stubGlobal("window", {});
    expect(await saveRecording(new Blob(["x"]), "omni.webm")).toBe("saved");
    expect(link).toMatchObject({ href: "blob:rec", download: "omni.webm", rel: "noopener" });
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rec");
  });

  it("writes through the save picker, and respects a cancelled picker", async () => {
    const writable = { write: vi.fn(), close: vi.fn() };
    const picker = vi.fn(async () => ({ createWritable: async () => writable }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const blob = new Blob(["x"]);
    expect(await saveRecording(blob, "omni.webm")).toBe("saved");
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "omni.webm" }));
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalled();
    expect(link.click).not.toHaveBeenCalled();

    picker.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
    expect(await saveRecording(blob, "omni.webm")).toBe("cancelled");
    picker.mockRejectedValueOnce(new DOMException("no activation", "SecurityError"));
    expect(await saveRecording(blob, "omni.webm")).toBe("saved");
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
