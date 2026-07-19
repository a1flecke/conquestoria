import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { RELIGION_SFX, FAMINE_SFX } from './sfx-catalog';

// #594 MR7: bespoke religion + famine stingers. Mirrors PirateAudioDirector's shape
// (playStinger calls, not MusicDirector's STINGER/handle*() machinery), because these
// are one-shot event stingers, not adaptive-music-state transitions.
//
// Notification-chime replacement happens for ALL SIX toast-routed cues (religion:founded,
// religion:city-converted, religion:loyalty-warning, religion:city-defected, and famine
// onset/resolved) via the sfxCue parameter threaded through the toast pipeline (see
// AudioSystem.playReligionStinger and notification-routing.ts's routeReligionFounded/
// routeReligionCityConverted/routeLoyaltyWarning/routeCityDefected/routeCrisisStarted/
// routeCrisisResolved), so the generic SFX.notification() synth chime and this director's
// bespoke OGG never both fire for the same toast.
//
// Inline review fix: an earlier draft wired famine onset/resolved via a DIRECT
// bus.on('crisis:started'/'crisis:resolved') subscription here, on the assumption
// (carried over from the originating issue) that famine had no existing notification
// sound. That assumption was wrong -- routeCrisisStarted/routeCrisisResolved in
// notification-routing.ts already toast famine crises to the affected civ, and that
// toast already played the generic SFX.notification() chime. The direct bus
// subscription would have played the bespoke stinger ALONGSIDE that generic chime on
// every famine onset/resolution -- a doubled-sound bug. Famine now uses the exact same
// toast-cue replacement mechanism as the other four events instead.
//
// religion:preached remains bus-driven (playCue is never called for it) because preach
// genuinely has no toast/notification today -- it is a pure addition, not a
// replacement.
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
    );
  }

  // Called by AudioSystem.playReligionStinger() for the 6 toast-replacement cues
  // (founded / city-converted / loyalty-warning / city-defected / famine-onset /
  // famine-resolved). Not bus-driven -- the toast pipeline already resolved
  // privacy/hot-seat delivery by the time this fires, so no currentPlayer re-check is
  // needed here.
  async playCue(cue: string): Promise<void> {
    if (this.isPresentationSuppressed()) return;
    if (cue === 'famine-onset') {
      await this.playStingerWithDuck(FAMINE_SFX.onset.file).catch(() => {});
      return;
    }
    if (cue === 'famine-resolved') {
      await this.playStingerWithDuck(FAMINE_SFX.resolved.file).catch(() => {});
      return;
    }
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
