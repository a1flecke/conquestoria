import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import type { AudioLoader } from './audio-loader';
import type { AudioMixer } from './audio-mixer';
import { PIRATE_HEADQUARTERS_SFX, PIRATE_STRATEGIC_SFX } from './sfx-catalog';

export type PirateAmbientStopReason =
  | 'panel-closed' | 'focus-changed' | 'player-changed'
  | 'game-ended' | 'muted' | 'system-disposed';

export class PirateAudioDirector {
  private unsubscribers: Array<() => void> = [];
  private requestId = 0;
  private enabled = true;
  private activeFactionId: string | null = null;

  constructor(
    private readonly mixer: Pick<AudioMixer, 'setAmbienceLoop' | 'stopAmbience'>,
    private readonly loader: Pick<AudioLoader, 'get'>,
    private readonly playStinger: (path: string) => Promise<void>,
    private readonly getState: () => GameState,
  ) {}

  start(bus: EventBus): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(
      bus.on('pirate:audio-cue', event => {
        const state = this.getState();
        if (!this.enabled || !event.viewerIds.includes(state.currentPlayer)) return;
        void this.playStinger(PIRATE_STRATEGIC_SFX[event.cue].file).catch(() => {});
      }),
      bus.on('pirate:headquarters-destroyed', event => {
        const state = this.getState();
        if (!this.enabled || !event.viewerIds.includes(state.currentPlayer)) return;
        void this.playStinger(PIRATE_HEADQUARTERS_SFX.collapse.file).catch(() => {});
      }),
      bus.on('currentPlayer:changed-after-handoff', () => this.stopAmbience('player-changed')),
      bus.on('game:over', () => this.stopAmbience('game-ended')),
    );
  }

  async startHeadquartersAmbience(factionId: string): Promise<boolean> {
    if (!this.enabled) return this.rejectAmbience();
    const state = this.getState();
    const faction = state.pirates?.factions[factionId];
    if (!faction || faction.headquarters.kind !== 'coastal-enclave') return this.rejectAmbience();
    const viewer = state.civilizations[state.currentPlayer];
    if (viewer?.visibility.tiles[hexKey(faction.headquarters.position)] !== 'visible') return this.rejectAmbience();
    if (!state.pirates?.intelByCiv[state.currentPlayer]?.[factionId]) return this.rejectAmbience();
    if (this.activeFactionId === factionId) return true;
    const requestId = ++this.requestId;
    let buffer: AudioBuffer;
    try {
      buffer = await this.loader.get(PIRATE_HEADQUARTERS_SFX.ambience.file);
    } catch {
      return this.rejectAmbience();
    }
    if (requestId !== this.requestId || !this.enabled) return false;
    this.mixer.setAmbienceLoop(buffer, PIRATE_HEADQUARTERS_SFX.ambience.loop, 350, 0.28);
    this.activeFactionId = factionId;
    return true;
  }

  private rejectAmbience(): false {
    if (this.activeFactionId) this.stopAmbience('focus-changed');
    return false;
  }

  stopAmbience(_reason: PirateAmbientStopReason): void {
    this.requestId++;
    this.activeFactionId = null;
    this.mixer.stopAmbience(350);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopAmbience('muted');
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.stopAmbience('system-disposed');
  }
}
