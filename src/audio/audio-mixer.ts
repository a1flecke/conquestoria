import type { LoopPoints } from './audio-catalog';

export type BusId = 'era' | 'accent' | 'adaptive' | 'stinger' | 'sfx';
export type SnapshotId = 'silent' | 'peace' | 'at-war' | 'stinger-duck';

type MusicBusId = Exclude<BusId, 'sfx'>;

// Re-export for consumers that need the type without importing audio-catalog
export type { LoopPoints };

const SNAPSHOTS: Record<SnapshotId, Record<MusicBusId, number>> = {
  silent:         { era: 0.0, accent: 0.00, adaptive: 0.0, stinger: 0.0 },
  peace:          { era: 1.0, accent: 0.70, adaptive: 0.0, stinger: 1.0 },
  'at-war':       { era: 1.0, accent: 0.50, adaptive: 0.8, stinger: 1.0 },
  'stinger-duck': { era: 0.5, accent: 0.35, adaptive: 0.4, stinger: 1.0 },
};

interface BusState {
  snapshotGain: GainNode;    // Controlled by setSnapshot — always reflects current snapshot value
  sourceGain: GainNode | null; // Per-active-source fade envelope; null when no source playing
  source: AudioBufferSourceNode | null;
}

export class AudioMixer {
  private musicBuses: Record<MusicBusId, BusState>;
  private sfxBus: BusState;
  private musicMasterGain: GainNode;
  private currentMusicVolume = 1.0;
  private musicEnabled = true;

  constructor(private ctx: AudioContext) {
    this.musicMasterGain = ctx.createGain();
    this.musicMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    this.musicMasterGain.connect(ctx.destination);

    const makeMusicBus = (): BusState => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.connect(this.musicMasterGain);
      return { snapshotGain: g, sourceGain: null, source: null };
    };

    this.musicBuses = {
      era:      makeMusicBus(),
      accent:   makeMusicBus(),
      adaptive: makeMusicBus(),
      stinger:  makeMusicBus(),
    };

    // SFX bus bypasses musicMasterGain — routes directly to destination so muting music doesn't silence SFX
    const sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);
    sfxGain.connect(ctx.destination);
    this.sfxBus = { snapshotGain: sfxGain, sourceGain: null, source: null };
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

    // Fade in the new source via its own gain envelope
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
      src.onended = () => resolve();
      src.start();
      b.source = src;
    });
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

  setMasterMusicVolume(v: number, fadeMs = 0): void {
    const now = this.ctx.currentTime;
    const gain = this.musicMasterGain.gain;
    if (fadeMs === 0) {
      gain.setValueAtTime(v, now);
    } else {
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(v, now + fadeMs / 1000);
    }
  }

  setMusicVolume(v: number): void {
    this.currentMusicVolume = Math.max(0, Math.min(1, v));
    if (this.musicEnabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicMasterGain.gain.setValueAtTime(perceptual, this.ctx.currentTime);
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    const now = this.ctx.currentTime;
    // M-2: cancel any in-flight ramp (e.g., game-end fade) before overriding
    this.musicMasterGain.gain.cancelScheduledValues(now);
    if (enabled) {
      const perceptual = this.currentMusicVolume * this.currentMusicVolume;
      this.musicMasterGain.gain.setValueAtTime(perceptual, now);
    } else {
      this.musicMasterGain.gain.setValueAtTime(0, now);
    }
  }

  setSfxEnabled(enabled: boolean): void {
    const sfxLevel = enabled ? 1.0 : 0;
    this.sfxBus.snapshotGain.gain.setValueAtTime(sfxLevel, this.ctx.currentTime);
  }

  setSfxVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.sfxBus.snapshotGain.gain.setValueAtTime(clamped * clamped, this.ctx.currentTime);
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
    } catch {
      // Sources may already be stopped
    }
  }
}
