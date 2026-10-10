// NoCPU PCM playback adapter, GPL-3.0-or-later.
// Playback consumes circuit-generated samples and never synthesizes game effects.
const UNLOCK_TIMEOUT_MS = 3000;

export class CircuitAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private volume = 0.6;
  private muted = false;
  private active = false;
  private intent = 0;
  private unlockAttempt = 0;
  private scheduledSamples = 0;
  private nonzeroSamples = 0;
  private transitions = 0;
  private previousSample = 0;
  private hasPrevious = false;
  private underruns = 0;
  private discardedQueues = 0;
  private interrupted: () => void;

  constructor(interrupted: () => void) { this.interrupted = interrupted; }

  async unlock(): Promise<boolean> {
    const intent = this.intent;
    const attempt = ++this.unlockAttempt;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
        this.updateGain();
        this.context.addEventListener('statechange', () => {
          if (this.active && this.context?.state !== 'running') { this.active = false; this.interrupted(); }
        });
      }
      // A missing/interrupted device may leave resume() pending indefinitely.
      // Invoke it in the gesture, but bound the wait and leave playback inactive
      // on failure. Its eventual completion cannot activate this expired attempt.
      // Device initialization can take more than 1.5 seconds; gameplay continues
      // immediately while this finite recovery window remains open.
      if (this.context.state !== 'running') {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const resumed = await Promise.race([
          this.context.resume().then(() => true, () => false),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), UNLOCK_TIMEOUT_MS); }),
        ]);
        if (timer) clearTimeout(timer);
        if (!resumed) {
          if (intent === this.intent && attempt === this.unlockAttempt) this.active = false;
          return false;
        }
      }
      if (intent !== this.intent || attempt !== this.unlockAttempt) return false;
      const wasActive = this.active;
      this.active = this.context.state === 'running';
      if (!wasActive) this.nextTime = this.context.currentTime + 0.055;
      return this.active;
    } catch {
      if (intent === this.intent && attempt === this.unlockAttempt) this.active = false;
      return false;
    }
  }

  setVolume(volume: number): void { this.volume = volume; this.updateGain(); }
  setMuted(muted: boolean): void { this.muted = muted; this.updateGain(); }

  private updateGain(): void {
    if (this.context && this.gain) this.gain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.context.currentTime);
  }

  push(samples: Int16Array, sampleRate: number): void {
    const context = this.context;
    if (!context || !this.gain || !this.active || context.state !== 'running' || samples.length === 0) return;
    // Keep a short output lead. Under a stall, start fresh instead of replaying old sound.
    if (this.nextTime > context.currentTime + 0.18) { this.discardedQueues += 1; this.clear(); }
    if (this.nextTime < context.currentTime) { this.underruns += 1; this.clear(); }
    this.nextTime = Math.max(this.nextTime, context.currentTime + 0.035);
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 32768;
      if (samples[i] !== 0) this.nonzeroSamples += 1;
      if (this.hasPrevious && samples[i] !== this.previousSample) this.transitions += 1;
      this.previousSample = samples[i];
      this.hasPrevious = true;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
    source.start(this.nextTime);
    this.scheduledSamples += samples.length;
    this.nextTime += buffer.duration;
  }

  clear(): void {
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear();
    this.nextTime = this.context ? this.context.currentTime + 0.055 : 0;
  }

  pause(): void { this.intent += 1; this.active = false; this.clear(); }

  metrics(): Record<string, number | string> {
    return {
      scheduledSamples: this.scheduledSamples, nonzeroSamples: this.nonzeroSamples,
      transitions: this.transitions, underruns: this.underruns, discardedQueues: this.discardedQueues,
      queueDepth: this.sources.size, queuedMs: this.context && this.active && this.sources.size ? Math.max(0, this.nextTime - this.context.currentTime) * 1000 : 0,
      contextState: this.context?.state ?? 'unavailable',
    };
  }
}
