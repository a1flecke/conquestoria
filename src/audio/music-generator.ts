// Procedural music generation using Web Audio API
// Each era has a distinct palette of sounds
import { createRng } from '@/systems/map-generator';

let musicRng = createRng('music-default');

export function seedMusicRng(seed: string): void {
  musicRng = createRng(`music-${seed}`);
}

interface EraConfig {
  bpm: number;
  baseNote: number;     // Hz
  scale: number[];      // semitone offsets
  waveType: OscillatorType;
  droneVolume: number;
  melodyVolume: number;
  percVolume: number;
}

const ERA_CONFIGS: Record<number, EraConfig> = {
  1: { // Tribal
    bpm: 60,
    baseNote: 110,
    scale: [0, 2, 4, 7, 9],  // pentatonic
    waveType: 'triangle',
    droneVolume: 0.08,
    melodyVolume: 0.06,
    percVolume: 0.04,
  },
  2: { // Stone Age
    bpm: 72,
    baseNote: 130.81,
    scale: [0, 2, 3, 5, 7, 8, 10],  // natural minor
    waveType: 'triangle',
    droneVolume: 0.07,
    melodyVolume: 0.05,
    percVolume: 0.05,
  },
  3: { // Bronze Age
    bpm: 84,
    baseNote: 146.83,
    scale: [0, 2, 4, 5, 7, 9, 11],  // major
    waveType: 'sawtooth',
    droneVolume: 0.06,
    melodyVolume: 0.05,
    percVolume: 0.06,
  },
  4: { // Iron Age
    bpm: 96,
    baseNote: 164.81,
    scale: [0, 2, 3, 5, 7, 9, 10],  // dorian
    waveType: 'square',
    droneVolume: 0.05,
    melodyVolume: 0.06,
    percVolume: 0.07,
  },
};

export class MusicGenerator {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSources: AudioNode[] = [];
  private intervalIds: number[] = [];
  private currentEra = 0;

  start(era: number, volume: number = 0.5): void {
    this.stop();
    this.currentEra = era;

    try {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = volume;
      this.gainNode.connect(this.ctx.destination);

      const config = ERA_CONFIGS[era] ?? ERA_CONFIGS[1];
      this.playDrone(config);
      this.startMelody(config);
    } catch {
      // Web Audio not available
    }
  }

  stop(): void {
    for (const id of this.intervalIds) {
      clearInterval(id);
    }
    this.intervalIds = [];

    for (const source of this.activeSources) {
      try {
        (source as OscillatorNode).stop?.();
      } catch { /* already stopped */ }
    }
    this.activeSources = [];

    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.gainNode = null;
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  private playDrone(config: EraConfig): void {
    if (!this.ctx || !this.gainNode) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = config.baseNote;
    gain.gain.value = config.droneVolume;
    osc.connect(gain);
    gain.connect(this.gainNode);
    osc.start();
    this.activeSources.push(osc);

    // Fifth drone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = config.baseNote * 1.5;
    gain2.gain.value = config.droneVolume * 0.5;
    osc2.connect(gain2);
    gain2.connect(this.gainNode);
    osc2.start();
    this.activeSources.push(osc2);
  }

  private startMelody(config: EraConfig): void {
    if (!this.ctx || !this.gainNode) return;

    const beatMs = 60000 / config.bpm;
    let noteIndex = 0;

    const playNote = () => {
      if (!this.ctx || !this.gainNode) return;

      const scaleIdx = Math.floor(musicRng() * config.scale.length);
      const octave = musicRng() > 0.7 ? 2 : 1;
      const freq = config.baseNote * octave * Math.pow(2, config.scale[scaleIdx] / 12);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = config.waveType;
      osc.frequency.value = freq;
      gain.gain.value = config.melodyVolume;

      // Envelope
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(config.melodyVolume, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beatMs / 1000 * 0.8);

      osc.connect(gain);
      gain.connect(this.gainNode!);
      osc.start(now);
      osc.stop(now + beatMs / 1000);

      noteIndex++;
    };

    // Play a note every 2-4 beats (sparse melody)
    const id = setInterval(() => {
      if (musicRng() > 0.4) { // 60% chance to play each beat
        playNote();
      }
    }, beatMs * 2) as unknown as number;

    this.intervalIds.push(id);
  }
}
