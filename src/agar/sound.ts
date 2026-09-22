export type SoundKind =
  | 'eat' | 'split' | 'eject' | 'pop' | 'start' | 'end'
  | 'merge' | 'virus' | 'rank' | 'click' | 'achievement' | 'denied';

interface SoundPreset {
  from: number;
  to: number;
  length: number;
  gain: number;
  type: OscillatorType;
  throttleMs?: number;
}

const PRESETS: Record<SoundKind, SoundPreset> = {
  eat: { from: 620, to: 930, length: 0.075, gain: 0.028, type: 'sine', throttleMs: 65 },
  split: { from: 260, to: 390, length: 0.09, gain: 0.055, type: 'sine' },
  eject: { from: 340, to: 510, length: 0.075, gain: 0.05, type: 'triangle' },
  pop: { from: 160, to: 320, length: 0.11, gain: 0.06, type: 'sawtooth' },
  start: { from: 460, to: 690, length: 0.2, gain: 0.055, type: 'sine' },
  end: { from: 180, to: 81, length: 0.5, gain: 0.06, type: 'sine' },
  merge: { from: 300, to: 520, length: 0.12, gain: 0.045, type: 'sine', throttleMs: 120 },
  virus: { from: 140, to: 60, length: 0.3, gain: 0.07, type: 'square' },
  rank: { from: 520, to: 1040, length: 0.16, gain: 0.05, type: 'sine' },
  click: { from: 700, to: 900, length: 0.05, gain: 0.03, type: 'sine' },
  achievement: { from: 660, to: 1320, length: 0.28, gain: 0.06, type: 'triangle' },
  denied: { from: 220, to: 160, length: 0.09, gain: 0.04, type: 'square' },
};

class ArenaSound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SoundKind, number>();
  enabled = false;
  volume = 0.7;

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }

  play(kind: SoundKind) {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return;
    const preset = PRESETS[kind];
    const now = performance.now();
    if (preset.throttleMs && now - (this.lastPlayed.get(kind) ?? 0) < preset.throttleMs) return;
    this.lastPlayed.set(kind, now);
    try {
      const context = this.context;
      const time = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = preset.type;
      oscillator.frequency.setValueAtTime(Math.max(1, preset.from), time);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, preset.to), time + preset.length);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(preset.gain, time + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + preset.length);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      oscillator.start(time);
      oscillator.stop(time + preset.length + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
    } catch {
      /* Audio glitches must never affect gameplay. */
    }
  }
}

export const arenaSound = new ArenaSound();
