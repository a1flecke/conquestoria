import type { LoopPoints } from './audio-catalog';

export type BusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'voice' | 'sfx';
export type SnapshotId =
  | 'silent'
  | 'peace'
  | 'at-war'
  | 'unrest'
  | 'brink-of-defeat'
  | 'stinger-duck'
  | 'voice-duck';

type MusicBusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'voice';

// Re-export for consumers that need the type without importing audio-catalog
export type { LoopPoints };

// Gain values per snapshot per music bus.
// voice bus routes directly to destination (bypasses masterGain) — its values
// here control ducking only; absolute voice volume is set via voiceMasterGain.
// stinger bus routes through stingerMasterGain → masterGain.
const SNAPSHOTS: Record<SnapshotId, Record<MusicBusId, number>> = {
  silent:            { era: 0.0, accent: 0.00, adaptive: 0.0, stinger: 0.0, voice: 0.0 },
  peace:             { era: 1.0, accent: 0.70, adaptive: 0.0, stinger: 1.0, voice: 1.0 },
  'at-war':          { era: 1.0, accent: 0.50, adaptive: 0.8, stinger: 1.0, voice: 1.0 },
  unrest:            { era: 1.0, accent: 0.55, adaptive: 0.5, stinger: 1.0, voice: 1.0 },
  'brink-of-defeat': { era: 0.7, accent: 0.15, adaptive: 1.0, stinger: 1.0, voice: 1.0 },
  'stinger-duck':    { era: 0.5, accent: 0.35, adaptive: 0.4, stinger: 1.0, voice: 0.2 },
  'voice-duck':      { era: 0.5, accent: 0.35, adaptive: 0.4, stinger: 0.6, voice: 1.0 },
};

interface BusState {
  snapshotGain: GainNode;
  sourceGain: GainNode | null;
  source: AudioBufferSourceNode | null;
}

export class AudioMixer {
  private musicBuses: Record<MusicBusId, BusState>;
  private sfxBus: BusState;

  // Ambience uses sfxBus routing (unchanged from Spec 1)
  private ambienceGain: GainNode;
  private ambienceSourceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;

  // Gain hierarchy — see spec §4.1
  private masterGain: GainNode;         // era + accent + adaptive + stinger → destination
  private musicLayerGain: GainNode;     // era + accent + adaptive → masterGain
  private stingerMasterGain: GainNode;  // stinger → masterGain
  private voiceMasterGain: GainNode;    // voice → destination (bypasses masterGain)

  private currentMasterVolume = 1.0;
  private currentMusicVolume = 1.0;
  private musicEnabled = true;
  private currentSfxVolume = 1.0;
  private sfxEnabled = true;
  private currentVoiceVolume = 1.0;
  private voiceEnabled = true;
  private currentStingerVolume = 1.0;
  private stingerEnabled = true;

  constructor(private ctx: AudioContext) {
    // masterGain → destination (covers era + accent + adaptive + stinger)
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // musicLayerGain → masterGain (covers era + accent + adaptive only)
    this.musicLayerGain = ctx.createGain();
    this.musicLayerGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.musicLayerGain.connect(this.masterGain);

    // stingerMasterGain → masterGain (stinger bus; independent volume control)
    this.stingerMasterGain = ctx.createGain();
    this.stingerMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.stingerMasterGain.connect(this.masterGain);

    // voiceMasterGain → destination (bypasses masterGain intentionally —
    //   "mute music" must not silence advisor lines)
    this.voiceMasterGain = ctx.createGain();
    this.voiceMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.voiceMasterGain.connect(ctx.destination);

    const makeMusicBus = (parent: AudioNode): BusState => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.connect(parent);
      return { snapshotGain: g, sourceGain: null, source: null };
    };

    this.musicBuses = {
      era:      makeMusicBus(this.musicLayerGain),
      accent:   makeMusicBus(this.musicLayerGain),
      adaptive: makeMusicBus(this.musicLayerGain),
      stinger:  makeMusicBus(this.stingerMasterGain),
      voice:    makeMusicBus(this.voiceMasterGain),
    };

    // SFX bus → destination (unchanged — bypasses all music gain nodes)
    const sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);
    sfxGain.connect(ctx.destination);
    this.sfxBus = { snapshotGain: sfxGain, sourceGain: null, source: null };

    // Ambience routes through sfxBus
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.ambienceGain.connect(this.sfxBus.snapshotGain);
  }

  private getBus(id: BusId): BusState {
    return id === 'sfx' ? this.sfxBus : this.musicBuses[id as MusicBusId];
  }

  setBusSource(
    bus: BusId,
    buffer: AudioBuffer | null,
    loop: boolean,
    loopPoints: LoopPoints | null,
    fadeMs: number,
  ): void {
    const b = this.getBus(bus);
    const fadeS = fadeMs / 1000;
    const now = this.ctx.currentTime;

    // Fade out and stop the existing source if any
    if (b.source && b.sourceGain) {
      const oldGain = b.sourceGain;
      const oldSrc = b.source;
      b.source = null;
      b.sourceGain = null;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + Math.max(fadeS, 0.001));
      oldSrc.stop(now + Math.max(fadeS, 0.001));
    }

    if (!buffer) return;

    const srcGain = this.ctx.createGain();
    srcGain.gain.setValueAtTime(0, now);
    srcGain.gain.linearRampToValueAtTime(1, now + Math.max(fadeS, 0.001));
    srcGain.connect(b.snapshotGain);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    if (loop && loopPoints) {
      src.loopStart = loopPoints.loopStart;
      src.loopEnd = loopPoints.loopEnd;
    }
    src.connect(srcGain);
    src.start();

    b.sourceGain = srcGain;
    b.source = src;
  }

  playOneShot(bus: BusId, buffer: AudioBuffer): Promise<void> {
    return new Promise<void>(resolve => {
      const b = this.getBus(bus);

      // Cross-cut an existing source if one is playing (D-A9: 200ms cross-cut)
      if (b.source) {
        b.source.stop(this.ctx.currentTime + 0.2);
        b.source = null;
        b.sourceGain = null;
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = false;
      src.connect(b.snapshotGain);
      src.onended = () => {
        if (b.source === src) b.source = null;
        resolve();
      };
      src.start();
      b.source = src;
    });
  }

  setAmbienceLoop(
    buffer: AudioBuffer | null,
    loopPoints: LoopPoints | null,
    fadeMs: number,
    gain = 0.35,
  ): void {
    const fadeS = Math.max(fadeMs / 1000, 0.001);
    const now = this.ctx.currentTime;

    if (this.ambienceSource && this.ambienceSourceGain) {
      const oldGain = this.ambienceSourceGain;
      const oldSource = this.ambienceSource;
      this.ambienceSource = null;
      this.ambienceSourceGain = null;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + fadeS);
      oldSource.stop(now + fadeS);
    }

    if (!buffer) return;

    const targetGain = Math.max(0, Math.min(1, gain));
    const sourceGain = this.ctx.createGain();
    sourceGain.gain.setValueAtTime(0, now);
    sourceGain.gain.linearRampToValueAtTime(targetGain, now + fadeS);
    sourceGain.connect(this.ambienceGain);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (loopPoints) {
      source.loopStart = loopPoints.loopStart;
      source.loopEnd = loopPoints.loopEnd;
    }
    source.connect(sourceGain);
    source.start();

    this.ambienceSourceGain = sourceGain;
    this.ambienceSource = source;
  }

  stopAmbience(fadeMs = 500): void {
    this.setAmbienceLoop(null, null, fadeMs);
  }

  setSnapshot(id: SnapshotId, fadeMs: number): void {
    const now = this.ctx.currentTime;
    const preset = SNAPSHOTS[id];
    for (const [busId, target] of Object.entries(preset) as [MusicBusId, number][]) {
      const gain = this.musicBuses[busId].snapshotGain.gain;
      if (fadeMs === 0) {
        gain.setValueAtTime(target, now);
      } else {
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(target, now + fadeMs / 1000);
      }
    }
  }

  // --- Master volume (covers era + accent + adaptive + stinger; NOT voice or SFX) ---
  setMasterVolume(v: number, fadeMs = 0): void {
    this.currentMasterVolume = Math.max(0, Math.min(1, v));
    const now = this.ctx.currentTime;
    const perceptual = this.currentMasterVolume * this.currentMasterVolume;
    const gain = this.masterGain.gain;
    if (fadeMs === 0) {
      gain.setValueAtTime(perceptual, now);
    } else {
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(perceptual, now + fadeMs / 1000);
    }
  }

  /** @deprecated Use setMasterVolume instead */
  setMasterMusicVolume(v: number, fadeMs = 0): void {
    this.setMasterVolume(v, fadeMs);
  }

  // --- Music layer (era + accent + adaptive only) ---
  setMusicVolume(v: number): void {
    this.currentMusicVolume = Math.max(0, Math.min(1, v));
    if (this.musicEnabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicLayerGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    const now = this.ctx.currentTime;
    // M-2: cancel any in-flight ramp before overriding
    this.musicLayerGain.gain.cancelScheduledValues(now);
    if (enabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicLayerGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.musicLayerGain.gain.setValueAtTime(0, now);
    }
  }

  // --- Stinger volume (independent of music layer) ---
  setStingerVolume(v: number): void {
    this.currentStingerVolume = Math.max(0, Math.min(1, v));
    if (this.stingerEnabled) {
      const perceptual = this.currentStingerVolume * this.currentStingerVolume;
      this.stingerMasterGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  setStingerEnabled(enabled: boolean): void {
    this.stingerEnabled = enabled;
    const now = this.ctx.currentTime;
    if (enabled) {
      const perceptual = this.currentStingerVolume * this.currentStingerVolume;
      this.stingerMasterGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.stingerMasterGain.gain.setValueAtTime(0, now);
    }
  }

  // --- Voice volume (bypasses masterGain) ---
  setVoiceVolume(v: number): void {
    this.currentVoiceVolume = Math.max(0, Math.min(1, v));
    if (this.voiceEnabled) {
      const perceptual = this.currentVoiceVolume * this.currentVoiceVolume;
      this.voiceMasterGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    const now = this.ctx.currentTime;
    if (enabled) {
      const perceptual = this.currentVoiceVolume * this.currentVoiceVolume;
      this.voiceMasterGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.voiceMasterGain.gain.setValueAtTime(0, now);
    }
  }

  // --- SFX (unchanged routing from Spec 1) ---
  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    const now = this.ctx.currentTime;
    if (enabled) {
      const perceptual = this.currentSfxVolume * this.currentSfxVolume;
      this.sfxBus.snapshotGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.sfxBus.snapshotGain.gain.setValueAtTime(0, now);
    }
  }

  setSfxVolume(v: number): void {
    this.currentSfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxEnabled) {
      const perceptual = this.currentSfxVolume * this.currentSfxVolume;
      this.sfxBus.snapshotGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  getSfxRoutingNode(): AudioNode {
    return this.sfxBus.snapshotGain;
  }

  dispose(): void {
    try {
      for (const bus of Object.values(this.musicBuses)) {
        bus.source?.stop();
      }
      this.sfxBus.source?.stop();
      this.ambienceSource?.stop();
    } catch {
      // Sources may already be stopped
    }
  }
}
