import { music } from './Data';
import { Save } from './Save';
import { soundFiles } from './AssetRegistry';

/**
 * All sound is synthesised at runtime. Each effect is a small jsfxr-like parameter set.
 * Music is a step sequencer over the patterns in data/music.json.
 * The AssetRegistry can later map an effect id to a real file; until then these play.
 */
export interface Sfx { wave: OscillatorType | 'noise'; f0: number; f1: number; dur: number; vol: number; attack?: number }

export const SFX: Record<string, Sfx> = {
  shoot:   { wave: 'square', f0: 1400, f1: 900, dur: 0.035, vol: 0.06 },
  empty:   { wave: 'square', f0: 140, f1: 110, dur: 0.18, vol: 0.12 },
  reload:  { wave: 'triangle', f0: 300, f1: 700, dur: 0.25, vol: 0.08 },
  hit:     { wave: 'noise', f0: 3000, f1: 1500, dur: 0.05, vol: 0.12 },
  tear:    { wave: 'noise', f0: 5000, f1: 800, dur: 0.18, vol: 0.16 },
  splash:  { wave: 'noise', f0: 900, f1: 200, dur: 0.3, vol: 0.2 },
  throw:   { wave: 'triangle', f0: 400, f1: 200, dur: 0.12, vol: 0.1 },
  hurt:    { wave: 'sawtooth', f0: 220, f1: 90, dur: 0.2, vol: 0.14 },
  dash:    { wave: 'noise', f0: 1200, f1: 3000, dur: 0.12, vol: 0.08 },
  pickup:  { wave: 'square', f0: 700, f1: 1400, dur: 0.1, vol: 0.09 },
  sachet:  { wave: 'noise', f0: 6000, f1: 3000, dur: 0.09, vol: 0.12 },
  ding:    { wave: 'sine', f0: 1320, f1: 1320, dur: 0.25, vol: 0.12 },
  buzz:    { wave: 'sawtooth', f0: 110, f1: 100, dur: 0.45, vol: 0.14 },
  win:     { wave: 'square', f0: 523, f1: 1046, dur: 0.4, vol: 0.1 },
  door:    { wave: 'triangle', f0: 200, f1: 320, dur: 0.15, vol: 0.1 },
  select:  { wave: 'square', f0: 880, f1: 880, dur: 0.05, vol: 0.07 },
  boss:    { wave: 'sawtooth', f0: 80, f1: 160, dur: 0.6, vol: 0.14 },
  dive:    { wave: 'triangle', f0: 900, f1: 120, dur: 0.6, vol: 0.12 },
};

class AudioSystem {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  noise: AudioBuffer | null = null;
  track: string | null = null;
  speed = 1;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  played: Record<string, number> = {};
  private buffers = new Map<string, AudioBuffer>();

  /** Decode any sound files registered in the AssetRegistry; they then replace the synth. */
  private loadFiles(): void {
    for (const [id, url] of soundFiles) {
      fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx!.decodeAudioData(b)).then((buf) => this.buffers.set(id, buf)).catch(() => { /* keep synth */ });
    }
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = Save.get().muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.loadFiles();
    if (this.track) this.startLoop();
  }

  get muted(): boolean { return Save.get().muted; }
  setMuted(m: boolean): void {
    Save.update((d) => { d.muted = m; });
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  play(id: string, pitch = 1): void {
    this.played[id] = (this.played[id] ?? 0) + 1;
    if (!this.ctx || !this.master) return;
    const file = this.buffers.get(id);
    if (file) {
      const src = this.ctx.createBufferSource();
      src.buffer = file; src.playbackRate.value = pitch; src.connect(this.master); src.start();
      return;
    }
    const s = SFX[id];
    if (!s) return;
    this.tone(s, pitch, this.ctx.currentTime, this.master);
  }

  blip(pitch: number): void {
    if (!this.ctx || !this.master) return;
    this.tone({ wave: 'square', f0: 520 * pitch, f1: 520 * pitch, dur: 0.03, vol: 0.05 }, 1, this.ctx.currentTime, this.master);
  }

  private tone(s: Sfx, pitch: number, t: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(s.vol, t + (s.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
    g.connect(dest);
    if (s.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(s.f0 * pitch, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, s.f1 * pitch), t + s.dur);
      src.connect(f); f.connect(g);
      src.start(t, Math.random() * 0.5); src.stop(t + s.dur + 0.02);
    } else {
      const o = ctx.createOscillator();
      o.type = s.wave;
      o.frequency.setValueAtTime(s.f0 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, s.f1 * pitch), t + s.dur);
      o.connect(g);
      o.start(t); o.stop(t + s.dur + 0.02);
    }
  }

  /** Switch music track (id from data/music.json). */
  music(track: string | null): void {
    if (track === this.track) return;
    this.track = track;
    this.speed = 1;
    this.step = 0;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (track && this.ctx) this.startLoop();
  }

  setSpeed(mult: number): void { this.speed = Math.max(0.5, Math.min(2, mult)); }

  private startLoop(): void {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule(): void {
    if (!this.ctx || !this.track || !this.musicGain) return;
    const tr = music.tracks[this.track];
    if (!tr) return;
    const bpm = (music.bpm[this.track] ?? 120) * this.speed;
    const stepDur = 60 / bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const i = this.step % 16;
      const lead = tr.lead[i]; const bass = tr.bass[i]; const dr = tr.drums[i];
      const hz = (n: number) => 440 * Math.pow(2, n / 12);
      if (lead !== null && lead !== undefined) this.tone({ wave: 'square', f0: hz(lead), f1: hz(lead), dur: stepDur * 0.9, vol: 0.05 }, 1, this.nextTime, this.musicGain);
      if (bass !== null && bass !== undefined) this.tone({ wave: 'triangle', f0: hz(bass), f1: hz(bass), dur: stepDur * 1.8, vol: 0.12 }, 1, this.nextTime, this.musicGain);
      if (dr === 'k') this.tone({ wave: 'sine', f0: 150, f1: 40, dur: 0.12, vol: 0.3 }, 1, this.nextTime, this.musicGain);
      if (dr === 's') this.tone({ wave: 'noise', f0: 2000, f1: 1000, dur: 0.1, vol: 0.15 }, 1, this.nextTime, this.musicGain);
      if (dr === 'h') this.tone({ wave: 'noise', f0: 8000, f1: 7000, dur: 0.03, vol: 0.06 }, 1, this.nextTime, this.musicGain);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}

export const Audio = new AudioSystem();
