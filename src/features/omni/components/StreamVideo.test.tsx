import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamVideo } from "./StreamVideo";

const track = new EventTarget() as MediaStreamTrack;
const stream = {
  getTracks: () => [track],
  getVideoTracks: () => [track],
  getAudioTracks: () => [],
} as unknown as MediaStream;

let play: ReturnType<typeof vi.fn>;
let paused = true;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function setSize(video: HTMLVideoElement, width: number, height: number) {
  Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
  video.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  paused = true;
  play = vi.fn(async () => undefined);
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    get: () => paused,
    configurable: true,
  });
});
afterEach(() => {
  Reflect.deleteProperty(document, "hidden");
  Reflect.deleteProperty(HTMLMediaElement.prototype, "paused");
  vi.useRealTimers();
});

describe("StreamVideo", () => {
  it("binds the stream and starts playback", () => {
    render(<StreamVideo stream={stream} data-testid="v" />);
    const video = screen.getByTestId("v") as HTMLVideoElement;
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("resumes when the page comes back from the background (iOS pauses it)", () => {
    render(<StreamVideo stream={stream} data-testid="v" />);
    play.mockClear();
    setHidden(true);
    expect(play).not.toHaveBeenCalled();
    setHidden(false);
    expect(play).toHaveBeenCalledTimes(1);

    play.mockClear();
    paused = false;
    setHidden(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("resumes after a pause or when the track unmutes while the page shows", () => {
    vi.useFakeTimers();
    render(<StreamVideo stream={stream} data-testid="v" />);
    const video = screen.getByTestId("v") as HTMLVideoElement;
    play.mockClear();
    video.dispatchEvent(new Event("pause"));
    act(() => vi.runAllTimers());
    expect(play).toHaveBeenCalledTimes(1);
    track.dispatchEvent(new Event("unmute"));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("stops listening once unmounted", () => {
    const view = render(<StreamVideo stream={stream} data-testid="v" />);
    const video = screen.getByTestId("v") as HTMLVideoElement;
    view.unmount();
    expect(video.srcObject).toBeNull();
    play.mockClear();
    setHidden(false);
    track.dispatchEvent(new Event("unmute"));
    expect(play).not.toHaveBeenCalled();
  });

  it("reports the frame shape and each change of it", () => {
    const onShape = vi.fn();
    render(<StreamVideo stream={stream} onShape={onShape} data-testid="v" />);
    const video = screen.getByTestId("v") as HTMLVideoElement;
    expect(onShape).toHaveBeenLastCalledWith(null);
    setSize(video, 720, 1280);
    expect(onShape).toHaveBeenLastCalledWith("portrait");
    setSize(video, 720, 1280);
    expect(onShape).toHaveBeenCalledTimes(2);
    setSize(video, 1920, 1080);
    expect(onShape).toHaveBeenLastCalledWith("landscape");
  });
});
