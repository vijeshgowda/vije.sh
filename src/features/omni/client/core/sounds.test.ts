import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSounds } from "./sounds";

class Context {
  static instances: Context[] = [];
  currentTime = 10;
  destination = {};
  state: AudioContextState = "suspended";
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  tones: {
    frequency: { value: number };
    stop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  constructor() {
    Context.instances.push(this);
  }
  createOscillator() {
    const tone = {
      type: "sine",
      frequency: { value: 0 },
      connect: (gain: ReturnType<Context["createGain"]>) => gain,
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null as (() => void) | null,
    };
    this.tones.push(tone);
    return tone;
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

const instances: NotificationSounds[] = [];
function sounds() {
  const instance = new NotificationSounds();
  instances.push(instance);
  return instance;
}
beforeEach(() => {
  Context.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("navigator", { vibrate: vi.fn() });
});
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("notification sounds", () => {
  it("has no audio side effects until called in a user gesture", () => {
    sounds();
    expect(Context.instances).toHaveLength(0);
  });
  it("plays the original join, message and hangup tones", async () => {
    const instance = sounds();
    await instance.playJoinTone();
    const context = Context.instances[0];
    expect(context.resume).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(150);
    await instance.playMessageTone();
    await instance.playHangupTone();
    await vi.advanceTimersByTimeAsync(150);
    expect(context.tones.map((tone) => tone.frequency.value)).toEqual([440, 660, 880, 520, 340]);
    expect(context.tones.map((tone) => tone.stop.mock.calls[0][0])).toEqual([
      10.15, 10.2, 10.1, 10.15, 10.3,
    ]);
    expect(navigator.vibrate).toHaveBeenCalledWith(200);
    expect(navigator.vibrate).toHaveBeenCalledWith(100);
    context.tones[0].onended?.();
    expect(context.tones[0].disconnect).toHaveBeenCalledOnce();
  });
  it("cancels delayed notes and closes the context on dispose", async () => {
    const instance = sounds();
    await instance.playJoinTone();
    const context = Context.instances[0];
    await instance.dispose();
    await instance.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.tones).toHaveLength(1);
    expect(context.close).toHaveBeenCalledOnce();
    await expect(instance.playMessageTone()).rejects.toThrow("disposed");
  });
  it("surfaces permission and resume failures, and works without vibration", async () => {
    const instance = sounds();
    vi.stubGlobal("navigator", {});
    await instance.ensureAudioContext();
    const context = Context.instances[0];
    context.state = "suspended";
    context.resume.mockRejectedValueOnce(new Error("Audio blocked"));
    await expect(instance.playMessageTone()).rejects.toThrow("Audio blocked");
    await instance.playMessageTone();
    expect(context.tones).toHaveLength(1);
  });
});
