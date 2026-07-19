import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { RELIGION_SFX, FAMINE_SFX } from './sfx-catalog';

// #594 MR7: bespoke religion + famine stingers. Mirrors PirateAudioDirector's shape
// (dedicated bus.on() subscriptions calling playStingerWithDuck directly) rather than
// MusicDirector's STINGER/handle*() machinery, because these are one-shot event
// stingers, not adaptive-music-state transitions.
//
// Notification-chime replacement for religion:founded / city-converted /
// loyalty-warning / city-defected happens OUTSIDE this class -- via the sfxCue
// parameter threaded through the toast pipeline (see AudioSystem.playReligionStinger
// and notification-routing.ts), so the generic SFX.notification() synth chime and
// this director's bespoke OGG never both fire for the same toast. religion:preached
// and famine onset/resolved have no existing sound, so they ARE wired here directly
// as pure additions -- there is nothing to suppress for those three.
export class ReligionAudioDirector {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly playStingerWithDuck: (path: string) => Promise<void>,
    private readonly getState: () => GameState,
    private readonly isPresentationSuppressed: () => boolean = () => false,
  ) {}

  start(bus: EventBus): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(
      bus.on('religion:preached', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        void this.playStingerWithDuck(RELIGION_SFX.preach.file).catch(() => {});
      }),

      // Famine onset -- additive, no existing sound. Filters crisis:started to the
      // famine archetype and to the current viewer, mirroring the existing
      // crisis:started subscription's currentPlayerId filter in audio-system.ts.
      bus.on('crisis:started', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        const flavor = getCrisisFlavor(event.flavorId);
        if (flavor?.archetype !== 'famine') return;
        void this.playStingerWithDuck(FAMINE_SFX.onset.file).catch(() => {});
      }),

      // Famine resolved -- additive, no existing sound. Only plays for genuinely
      // positive resolutions, matching MusicDirector's own crisis:resolved outcome
      // filter ('contained' | 'recovered' | 'hunted') so an 'expired'/'abandoned'
      // outcome doesn't play a triumphant cue.
      bus.on('crisis:resolved', event => {
        const state = this.getState();
        if (this.isPresentationSuppressed() || event.civId !== state.currentPlayer) return;
        const flavor = getCrisisFlavor(event.flavorId);
        if (flavor?.archetype !== 'famine') return;
        if (event.outcome !== 'contained' && event.outcome !== 'recovered') return;
        void this.playStingerWithDuck(FAMINE_SFX.resolved.file).catch(() => {});
      }),
    );
  }

  // Called by AudioSystem.playReligionStinger() for the 4 toast-replacement cues
  // (founded / city-converted / loyalty-warning / city-defected). Not bus-driven --
  // the toast pipeline already resolved privacy/hot-seat delivery by the time this
  // fires, so no currentPlayer re-check is needed here.
  async playCue(cue: string): Promise<void> {
    if (this.isPresentationSuppressed()) return;
    const key = cue === 'religion-founded' ? 'founded' : cue;
    const entry = (RELIGION_SFX as Record<string, { file: string } | undefined>)[key];
    if (!entry) return;
    await this.playStingerWithDuck(entry.file).catch(() => {});
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }
}
