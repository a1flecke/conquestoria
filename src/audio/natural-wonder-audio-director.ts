import type { AudioLoader } from './audio-loader';
import type { AudioMixer } from './audio-mixer';
import { getCompleteNaturalWonderAudioEntry } from './natural-wonder-audio-catalog';

type TimerId = number | ReturnType<typeof setTimeout>;

export interface NaturalWonderAudioTimerFns {
  setTimeout: (callback: () => void, ms: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
}

const DEFAULT_TIMERS: NaturalWonderAudioTimerFns = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export type NaturalWonderAmbientStopReason =
  | 'codex-page-hidden'
  | 'map-focus-timeout'
  | 'panel-closed'
  | 'player-changed'
  | 'game-ended'
  | 'system-disposed';

export class NaturalWonderAudioDirector {
  private ambientTimer: TimerId | null = null;
  private ambientRequestId = 0;

  constructor(
    private readonly mixer: Pick<AudioMixer, 'setAmbienceLoop' | 'stopAmbience'>,
    private readonly loader: Pick<AudioLoader, 'get'>,
    private readonly playStingerWithDuck: (path: string) => Promise<void>,
    private readonly timers: NaturalWonderAudioTimerFns = DEFAULT_TIMERS,
  ) {}

  async playDiscoveryStinger(wonderId: string): Promise<boolean> {
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    void this.playStingerWithDuck(entry.stinger.file).catch(() => {});
    return true;
  }

  async playCodexReplay(wonderId: string): Promise<boolean> {
    const stingerPlayed = await this.playDiscoveryStinger(wonderId);
    const ambientStarted = await this.startCodexAmbient(wonderId);
    return stingerPlayed || ambientStarted;
  }

  async startCodexAmbient(wonderId: string): Promise<boolean> {
    const requestId = this.beginAmbientRequest();
    return this.startAmbient(wonderId, requestId);
  }

  async startMapFocusAmbient(wonderId: string): Promise<boolean> {
    const requestId = this.beginAmbientRequest();
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    const started = await this.startAmbient(wonderId, requestId);
    if (!started) return false;
    if (requestId !== this.ambientRequestId) return false;
    this.ambientTimer = this.timers.setTimeout(() => {
      this.stopAmbient('map-focus-timeout');
    }, entry.ambientLoop.mapFocusTimeoutMs);
    return true;
  }

  stopAmbient(_reason: NaturalWonderAmbientStopReason): void {
    this.ambientRequestId++;
    this.clearAmbientTimer();
    this.mixer.stopAmbience(550);
  }

  private beginAmbientRequest(): number {
    this.ambientRequestId++;
    this.clearAmbientTimer();
    return this.ambientRequestId;
  }

  private async startAmbient(wonderId: string, requestId: number): Promise<boolean> {
    const entry = getCompleteNaturalWonderAudioEntry(wonderId);
    if (!entry) return false;
    let buffer: AudioBuffer;
    try {
      buffer = await this.loader.get(entry.ambientLoop.file);
    } catch {
      return false;
    }
    if (requestId !== this.ambientRequestId) return false;
    this.mixer.setAmbienceLoop(
      buffer,
      entry.ambientLoop.loop,
      entry.ambientLoop.fadeInMs,
      entry.ambientLoop.gain,
    );
    return true;
  }

  private clearAmbientTimer(): void {
    if (this.ambientTimer === null) return;
    this.timers.clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
  }
}
