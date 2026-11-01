/**
 * Local call recorder, ported from the original Omni recorder.js. Nothing leaves the device: the
 * remote video fills a canvas, the local video sits in a corner, both audio tracks are mixed with
 * Web Audio, and a MediaRecorder turns the result into a WebM blob.
 *
 * Unlike the original it plays the streams in its own detached <video> elements, so it doesn't
 * depend on the call's DOM (which React may swap while recording, e.g. when the feeds swap).
 */

export const RECORD_WIDTH = 1280;
export const RECORD_HEIGHT = 720;
export const MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

type Video = Pick<
  HTMLVideoElement,
  "srcObject" | "muted" | "playsInline" | "videoWidth" | "videoHeight" | "play" | "pause"
>;
type Canvas = Pick<HTMLCanvasElement, "width" | "height" | "getContext" | "captureStream">;
type Recorder = Pick<MediaRecorder, "start" | "stop" | "mimeType" | "ondataavailable" | "onstop">;

export type RecorderEnv = {
  createVideo: () => Video;
  createCanvas: () => Canvas;
  createAudioContext: () => Pick<
    AudioContext,
    "createMediaStreamDestination" | "createMediaStreamSource" | "close"
  >;
  createRecorder: (stream: MediaStream, options?: MediaRecorderOptions) => Recorder;
  isTypeSupported: (type: string) => boolean;
  createStream: (tracks: MediaStreamTrack[]) => MediaStream;
  requestFrame: (draw: () => void) => number;
  cancelFrame: (id: number) => void;
};

export type RecordSources = {
  remote: MediaStream | null;
  local: MediaStream | null;
  /** Streams whose audio is mixed into the recording (mic and remote). */
  audio: (MediaStream | null)[];
};

function browserEnv(): RecorderEnv {
  return {
    createVideo: () => document.createElement("video"),
    createCanvas: () => document.createElement("canvas"),
    createAudioContext: () => new AudioContext(),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    isTypeSupported: (type) => MediaRecorder.isTypeSupported(type),
    createStream: (tracks) => new MediaStream(tracks),
    requestFrame: (draw) => requestAnimationFrame(draw),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
}

/** MediaRecorder plus canvas capture; Safari before 14.1 and some in-app browsers lack one. */
export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

/** `omni-K7Q2M9-2026-11-01T13-06-06.webm`: no characters that are awkward in file names. */
export function recordingName(code: string, at: Date): string {
  const room = code.replace(/[^A-Za-z0-9]/g, "") || "call";
  return `omni-${room}-${at.toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
}

/** Source rectangle that makes `video` cover a w×h box (CSS object-fit: cover). */
export function coverRect(vw: number, vh: number, w: number, h: number) {
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

export class CallRecorder {
  private readonly env: RecorderEnv;
  private recorder: Recorder | null = null;
  private chunks: Blob[] = [];
  private frame = 0;
  private audio: ReturnType<RecorderEnv["createAudioContext"]> | null = null;
  private stream: MediaStream | null = null;
  private remoteVideo: Video | null = null;
  private localVideo: Video | null = null;

  constructor(env?: Partial<RecorderEnv>) {
    this.env = { ...browserEnv(), ...env };
  }

  get recording() {
    return this.recorder !== null;
  }

  start({ remote, local, audio }: RecordSources) {
    if (this.recorder) return;
    const env = this.env;
    const canvas = env.createCanvas();
    canvas.width = RECORD_WIDTH;
    canvas.height = RECORD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.remoteVideo = this.play(remote);
    this.localVideo = this.play(local);

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, RECORD_WIDTH, RECORD_HEIGHT);
      this.drawCover(ctx, this.remoteVideo, 0, 0, RECORD_WIDTH, RECORD_HEIGHT);
      const self = this.localVideo;
      if (self?.videoWidth) {
        const pw = RECORD_WIDTH * 0.25;
        const ph = pw * (self.videoHeight / self.videoWidth || 0.5625);
        const pad = 24;
        const px = RECORD_WIDTH - pw - pad;
        const py = RECORD_HEIGHT - ph - pad;
        this.drawCover(ctx, self, px, py, pw, ph);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 3;
        ctx.strokeRect(px, py, pw, ph);
      }
      this.frame = env.requestFrame(draw);
    };

    try {
      draw();
      const tracks = [...canvas.captureStream(30).getVideoTracks()];
      const mix = env.createAudioContext();
      this.audio = mix;
      const destination = mix.createMediaStreamDestination();
      let mixed = false;
      for (const stream of audio) {
        if (!stream?.getAudioTracks().length) continue;
        try {
          mix.createMediaStreamSource(stream).connect(destination);
          mixed = true;
        } catch {
          // A stream that can't be mixed is left out; the rest still records.
        }
      }
      if (mixed) tracks.push(...destination.stream.getAudioTracks());
      this.stream = env.createStream(tracks);
      const mimeType = MIME_TYPES.find((type) => env.isTypeSupported(type));
      const recorder = env.createRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) this.chunks.push(event.data);
      };
      recorder.start(1_000);
      this.recorder = recorder;
    } catch (error) {
      this.release();
      throw error;
    }
  }

  /** Points the corner picture at a new local source (camera ↔ shared screen). */
  setLocal(local: MediaStream | null) {
    if (!this.recorder) return;
    this.stopVideo(this.localVideo);
    this.localVideo = this.play(local);
  }

  /** Stops and resolves the recorded WebM, or null if nothing was recorded. */
  stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(null);
    this.recorder = null;
    return new Promise((resolve) => {
      const finish = () => {
        const type = recorder.mimeType || "video/webm";
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.chunks = [];
        this.release();
        resolve(blob);
      };
      recorder.onstop = finish;
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });
  }

  private play(stream: MediaStream | null): Video | null {
    if (!stream?.getVideoTracks().length) return null;
    const video = this.env.createVideo();
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return video;
  }

  private stopVideo(video: Video | null) {
    if (!video) return;
    video.pause();
    video.srcObject = null;
  }

  private release() {
    this.env.cancelFrame(this.frame);
    this.frame = 0;
    // Only the recorder's own tracks (canvas capture, audio mix) stop; the call's tracks keep going.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    this.stopVideo(this.remoteVideo);
    this.stopVideo(this.localVideo);
    this.remoteVideo = null;
    this.localVideo = null;
  }

  private drawCover(
    ctx: CanvasRenderingContext2D,
    video: Video | null,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    if (!video?.videoWidth || !video.videoHeight) return;
    const { sx, sy, sw, sh } = coverRect(video.videoWidth, video.videoHeight, dw, dh);
    ctx.drawImage(video as HTMLVideoElement, sx, sy, sw, sh, dx, dy, dw, dh);
  }
}

/**
 * Saves a recording: the File System Access picker where available, otherwise a download link.
 * The blob is always typed as WebM video and only ever downloaded, never opened.
 */
export async function saveRecording(blob: Blob, name: string): Promise<"saved" | "cancelled"> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description: "WebM video", accept: { "video/webm": [".webm"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Any other failure (no user activation after a long call, etc.) falls back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
