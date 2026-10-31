export class NotificationSounds {
  private context: AudioContext | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  async ensureAudioContext() {
    if (this.disposed) throw new Error("Notification sounds have been disposed");
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    if (this.disposed) throw new Error("Notification sounds have been disposed");
  }

  async playJoinTone() {
    await this.ensureAudioContext();
    this.tone(440, 0.15, 0.12);
    this.later(() => this.tone(660, 0.2, 0.12));
    navigator.vibrate?.(200);
  }

  async playMessageTone() {
    await this.ensureAudioContext();
    this.tone(880, 0.1, 0.08);
    navigator.vibrate?.(100);
  }

  async playHangupTone() {
    await this.ensureAudioContext();
    this.tone(520, 0.15, 0.1);
    this.later(() => this.tone(340, 0.3, 0.1));
  }

  async dispose() {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const context = this.context;
    this.context = null;
    if (context) await context.close();
  }

  private later(play: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      play();
    }, 150);
    this.timers.add(timer);
  }

  private tone(frequency: number, duration: number, gainValue: number) {
    const context = this.context;
    if (!context) throw new Error("Notification audio context is not ready");
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }
}
