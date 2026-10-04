/**
 * Shared vocabulary for the use-case split of `turn-flow-controller.ts` (#1243): the deps, the narrowed
 * renderer/audio slices, the AI-move record and the public `TurnFlowController` interface. Slices import
 * from here, never from the composite.
 */
import type { EventBus } from '@/core/event-bus';
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import type { GameState, HexCoord, Unit, Civilization, CivBonusEffect } from '@/core/types';
import type { GameSession, SelectionStore, Notifier, UnpublishedStateWriter } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UserSettingsStore } from '@/app/user-settings-store';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { type CompletedRoundResult } from '@/core/completed-round-orchestrator';

/** The narrow slice of `RenderLoop` this controller needs. */
export type TurnFlowRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitMove' | 'setSelectedPirateFactionId' | 'setStrategicLaunchPreview'> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

/** The narrow slice of `AudioSystem` this controller needs. */
export type TurnFlowAudio = Pick<AudioSystem, 'setMasterVolume' | 'stopPirateAmbience'>;

export type AIMoveRecord = {
  unit: Unit;
  viewerId: string;
  visibleSegments: HexCoord[][];
};

export interface TurnFlowControllerDeps {
  readonly session: GameSession;
  /** #1015: hot-seat handoff (`viewer-not-yet-revealed`) and solo round adoption (`presentation-deferred`) are the only silent writes here. */
  readonly unpublished: UnpublishedStateWriter;
  readonly selection: SelectionStore;
  readonly renderLoop: TurnFlowRenderer;
  /**
   * The concrete class, not a narrowed `Pick<EventBus, 'emit'>` -- matches
   * the lesson documented on `SelectionControllerDeps.bus`: several
   * downstream pure functions this file calls (`runCompletedRound`,
   * `beginNetworkPlansForVictimTurn`'s callers elsewhere) are typed to the
   * concrete class in their own signatures, and `EventBus` has a private
   * field so no object literal can structurally satisfy a narrowed type.
   */
  readonly bus: EventBus;
  readonly uiLayer: HTMLElement;
  readonly audio: TurnFlowAudio;
  readonly router: Pick<PanelRouter, 'close' | 'open'>;
  /** The concrete class -- `RoundPresentationGate` has a private field, same reasoning as `bus` above. */
  readonly roundPresentationGate: RoundPresentationGate;
  readonly ceremonies: Pick<CeremonyCoordinator, 'clearForHandoff' | 'enqueueVictory'>;
  readonly notifier: Pick<Notifier, 'withHappenedTurn'>;
  readonly userSettingsStore: Pick<UserSettingsStore, 'getMasterVolume'>;
  /** Substitutes for `document.getElementById` -- see file docblock and `.claude/rules`'s port-purity note. */
  readonly getElementById: (id: string) => HTMLElement | null;
  /** Substitutes for `document.querySelector('[aria-label="Network intent"]')`. */
  readonly getNetworkIntentPanel: () => Element | null;
  /** Clears a viewer-private panel before the next hot-seat player can see it. */
  readonly closeVictoryProgressPanel: () => void;
  /** Refreshes the open viewer-private panel after a deliberate un-published capture write. */
  readonly refreshVictoryProgressPanel: () => void;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly updateHUD: () => void;
  readonly setBlockingOverlay: (id: string | null) => void;
  readonly currentCiv: () => Civilization;
  readonly getUnitTurnFlow: () => Pick<UnitTurnFlow, 'showEndTurnUnitWarningIfNeeded'>;
  readonly deselectUnit: () => void;
  readonly selectNextUnit: () => void;
  readonly scanBeastSightings: () => void;
  readonly scanSubmarineSightings: () => void;
  readonly maybeShowPendingHoardChoice: () => void;
  readonly maybeShowPendingGeneralChoice: () => void;
  readonly checkAdvisors: () => void;
  readonly showGameModeSelection: () => void;
  readonly reloadPage: () => void;
  readonly openCityPanelForCity: (city: GameState['cities'][string]) => void;
}

export interface TurnFlowController {
  endTurn(options?: { allowUnmovedUnits?: boolean }): Promise<void>;
  beginHotSeatHandoff(hotSeat: NonNullable<GameState['hotSeat']>, completesRound: boolean): Promise<void>;
  /** Renamed from `releaseHandoffToViewer` -- see file docblock. */
  enterViewerTurn(nextSlotId: string): void;
  closeNetworkPanelsForHandoff(): void;
  beginNetworkPlansForCurrentViewer(): void;
  runCurrentCompletedRound(state: GameState): CompletedRoundResult;
  captureAIMoves(fn: () => void): AIMoveRecord[];
  replayAIMoves(moves: AIMoveRecord[]): Promise<void>;
  handleVictoryIfNeeded(): boolean;
  centerOnCurrentPlayer(): void;
  emitCurrentPlayerAudioSnapshot(civId: string): void;
  maybeShowCouncilInterrupt(): void;
  showRequiredChoicesIfNeeded(): boolean;
  showReligionBoonIfNeeded(): boolean;
  refreshRequiredChoicesAfterAction(): void;
  closeRequiredChoicePanel(): void;
  finalizePendingCityCaptureChoice(disposition: 'occupy' | 'raze', attackerBonus?: CivBonusEffect): void;
}
