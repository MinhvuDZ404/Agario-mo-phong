class ArenaSound {
  private context: AudioContext | null = null;
  enabled = false;
  private lastEat = 0;

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      this.enabled = false;
    }
  }

  play(kind: 'eat' | 'split' | 'eject' | 'pop' | 'start' | 'end') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const time = context.currentTime;
    if (kind === 'eat' && time - this.lastEat < 0.065) return;
    if (kind === 'eat') this.lastEat = time;
    const frequencies = { eat: 620, split: 260, eject: 340, pop: 160, start: 460, end: 180 };
    const length = kind === 'end' ? 0.5 : kind === 'start' ? 0.2 : 0.075;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind], time);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind] * (kind === 'end' ? 0.45 : 1.5), time + length);
    volume.gain.setValueAtTime(0.0001, time);
    volume.gain.exponentialRampToValueAtTime(kind === 'eat' ? 0.028 : 0.055, time + 0.008);
    volume.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + length + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
  }
}

export const arenaSound = new ArenaSound();