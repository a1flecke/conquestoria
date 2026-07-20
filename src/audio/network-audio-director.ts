import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { NETWORK_STRATEGIC_SFX } from './sfx-catalog';

/** Viewer-scoped, rate-limited stingers for outcomes already surfaced in the UI. */
export class NetworkAudioDirector {
  private unsubscribers: Array<() => void> = [];
  private lastPlayedTurnByCue = new Map<string, number>();

  constructor(
    private readonly playStinger: (path: string) => Promise<void>,
    private readonly getState: () => GameState,
    private readonly isPresentationSuppressed: () => boolean = () => false,
  ) {}

  start(bus: EventBus): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(bus.on('network:audio-cue', event => {
      const state = this.getState();
      if (this.isPresentationSuppressed() || !event.viewerIds.includes(state.currentPlayer)) return;
      const cueKey = `${state.currentPlayer}:${event.cue}`;
      const lastPlayedTurn = this.lastPlayedTurnByCue.get(cueKey);
      // Constructive plans can resolve every owner turn. Three turns preserves feedback
      // without turning steady-state play into a metronome; urgent hostile/Surge cues
      // remain one-per-turn through the same guard.
      const minimumTurnGap = event.cue === 'constructive-resolution' ? 3 : 1;
      if (lastPlayedTurn !== undefined && state.turn - lastPlayedTurn < minimumTurnGap) return;
      this.lastPlayedTurnByCue.set(cueKey, state.turn);
      void this.playStinger(NETWORK_STRATEGIC_SFX[event.cue].file).catch(() => {});
    }));
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.lastPlayedTurnByCue.clear();
  }
}
