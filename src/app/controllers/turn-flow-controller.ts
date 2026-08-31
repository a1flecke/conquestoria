/**
 * Owns turn advancement: `endTurn`, the hot-seat handoff lifecycle, AI-move
 * replay, difficulty-challenge application at handoff, and the
 * "entering a viewer's turn" ritual (#787 phase 9).
 *
 * Every moved function below is exposed as a method on the returned
 * controller, matching the precedent set by `SelectionController` (#787
 * phase 8c) rather than the plan doc's minimal two-method sketch — that
 * sketch undersold Phase 8's real interface too (see this phase's plan
 * entry and Phase 8's split note), and several of these functions have real
 * external callers in `main.ts` (`handleVictoryIfNeeded` from `enterCampaign`,
 * `finalizePendingCityCaptureChoice` from `MapInteractionController`'s deps,
 * `centerOnCurrentPlayer`/`maybeShowCouncilInterrupt`/
 * `emitCurrentPlayerAudioSnapshot`/`showRequiredChoicesIfNeeded` from
 * `startGame`) that still need a way to call them post-move.
 *
 * `releaseHandoffToViewer(nextSlotId)` is renamed `enterViewerTurn(nextSlotId)`
 * -- same signature, same body, name only. (An earlier draft of this file
 * dropped the parameter in favor of reading `session.getState().currentPlayer`,
 * reasoning that the two are always equal at every call site; a second review
 * pass judged that too fragile a behavioral-equivalence claim to lean on for a
 * hot-seat-handoff-critical function -- the parameter costs nothing to keep
 * and removes the risk category entirely, so it stays.)
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/core/*`, or
 * `@/ui/*` helper is imported directly, matching the precedent set by
 * `SelectionController`/`MapInteractionController`. Only concrete platform
 * services (`renderLoop`, `bus`, `audio`, `router`, `roundPresentationGate`,
 * `ceremonies`, `notifier`, `userSettingsStore`) and the main.ts-local
 * functions this phase does NOT move (`showNotification`, `updateHUD`,
 * `currentCiv`, `scanBeastSightings`, etc.) are threaded through as deps.
 */
import type { EventBus } from '@/core/event-bus';
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import type { GameState, HexCoord, Unit, Civilization, CivBonusEffect } from '@/core/types';
import type { GameSession, SelectionStore, Notifier } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UserSettingsStore } from '@/app/user-settings-store';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { SFX } from '@/audio/sfx';
import { autoSave } from '@/storage/save-manager';
import { isCivUnitInBeastTerritory } from '@/systems/beast-system';
import { closePlanningPanels, createRequiredChoicePanel } from '@/ui/required-choice-panel';
import { createReligionBoonModal } from '@/ui/religion-boon-modal';
import { chooseBoon } from '@/systems/religion-system';
import { showVictoryPanel } from '@/ui/victory-panel';
import { getCouncilInterrupt } from '@/systems/council-system';
import { collectCouncilInterrupt } from '@/core/hotseat-events';
import { getIdleCityIds, getRecommendedIdleCityChoice, needsResearchChoice, enqueueResearch, enqueueCityProduction } from '@/systems/planning-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { getAvailableTechs, getEffectiveTechCost } from '@/systems/tech-system';
import { estimateTurnsToComplete } from '@/systems/pacing-model';
import { finalizePlayerCityAssaultChoice } from '@/input/city-assault-flow';
import { emitMajorCityCaptureEvents } from '@/systems/city-capture-system';
import {
  getNextActiveHumanPlayerId,
  isActiveHumanRoundComplete,
} from '@/core/turn-cycling';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';
import { acknowledgeTurnHandoffSummary, showTurnHandoff } from '@/ui/turn-handoff';
import { closePirateWatersPanels } from '@/ui/pirate-waters-panel';
import { closeStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { beginNetworkPlansForVictimTurn } from '@/systems/network-plan-system';
import { applyPendingChallengeForCiv } from '@/core/opponent-challenge';
import { runCompletedRound, type CompletedRoundResult } from '@/core/completed-round-orchestrator';
import { createCompletedRoundHandoffTransaction } from '@/core/completed-round-handoff';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processTurn } from '@/core/turn-manager';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { applySupplyWarningTransitions } from '@/systems/supply-warning-system';

/** The narrow slice of `RenderLoop` this controller needs. */
export type TurnFlowRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitMove' | 'setSelectedPirateFactionId' | 'setStrategicLaunchPreview'> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

/** The narrow slice of `AudioSystem` this controller needs. */
export type TurnFlowAudio = Pick<AudioSystem, 'setMasterVolume' | 'stopPirateAmbience'>;

type AIMoveRecord = {
  unit: Unit;
  viewerId: string;
  visibleSegments: HexCoord[][];
};

export interface TurnFlowControllerDeps {
  readonly session: GameSession;
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
  readonly ceremonies: Pick<CeremonyCoordinator, 'clearForHandoff'>;
  readonly notifier: Pick<Notifier, 'withHappenedTurn'>;
  readonly userSettingsStore: Pick<UserSettingsStore, 'getMasterVolume'>;
  /** Substitutes for `document.getElementById` -- see file docblock and `.claude/rules`'s port-purity note. */
  readonly getElementById: (id: string) => HTMLElement | null;
  /** Substitutes for `document.querySelector('[aria-label="Network intent"]')`. */
  readonly getNetworkIntentPanel: () => Element | null;
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

export function createTurnFlowController(deps: TurnFlowControllerDeps): TurnFlowController {
  const { session, selection, renderLoop, bus, uiLayer, audio, router, roundPresentationGate, ceremonies, notifier, userSettingsStore } = deps;

  function closeRequiredChoicePanel(): void {
    deps.getElementById('required-choice-panel')?.remove();
    deps.setBlockingOverlay(null);
  }

  // #591 MR4: a founded-but-boonless religion has NO effects until the owner chooses --
  // re-prompted every time the owner attempts to end their turn, same blocking pattern as
  // showRequiredChoicesIfNeeded (the only other "must decide before proceeding" surface
  // in this file), so a human owner can never leave their own religion pending forever.
  function showReligionBoonIfNeeded(): boolean {
    const civId = session.getState().currentPlayer;
    const civ = session.getState().civilizations[civId];
    if (!civ?.isHuman) return false;
    const ownReligion = Object.values(session.getState().religions ?? {}).find(r => r.ownerCivId === civId);
    if (!ownReligion || ownReligion.boon !== undefined) {
      deps.getElementById('religion-boon-modal')?.remove();
      return false;
    }
    if (deps.getElementById('religion-boon-modal')) return true;

    closePlanningPanels(document);
    deps.setBlockingOverlay('religion-boon');
    createReligionBoonModal(uiLayer, {
      religionName: ownReligion.name,
      onChooseBoon: (boon) => {
        session.setStateWithoutRefresh(chooseBoon(session.getState(), ownReligion.id, boon));
        deps.getElementById('religion-boon-modal')?.remove();
        deps.setBlockingOverlay(null);
        deps.showNotification(`${ownReligion.name} now grants ${boon}.`, 'success');
        renderLoop.setGameState(session.getState());
        deps.updateHUD();
      },
    });
    return true;
  }

  function refreshRequiredChoicesAfterAction(): void {
    deps.getElementById('required-choice-panel')?.remove();
    closePlanningPanels(document);
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    // #787 phase 12 (#794): release 'required-choice' before
    // showRequiredChoicesIfNeeded() may push it again for the next
    // outstanding choice. With 2+ idle cities (or an idle city plus missing
    // research), a player resolving them one at a time re-enters this
    // function once per choice -- under the old single-slot overlay each
    // re-push was a harmless overwrite of the same id, but the
    // reference-counted overlay nests them, and only the *last* choice's
    // resolution ever pops (via closeRequiredChoicePanel below). Without
    // this explicit release, resolving N required choices in one sitting
    // leaves N-1 phantom pushes on the stack, permanently blocking
    // interaction for the rest of the game.
    deps.setBlockingOverlay(null);
    showRequiredChoicesIfNeeded();
  }

  function showRequiredChoicesIfNeeded(): boolean {
    const civId = session.getState().currentPlayer;
    const idleCityIds = getIdleCityIds(session.getState(), civId);
    const missingResearch = needsResearchChoice(session.getState(), civId);
    const existing = deps.getElementById('required-choice-panel');

    if (!idleCityIds.length && !missingResearch) {
      closeRequiredChoicePanel();
      return false;
    }

    if (existing) {
      return true;
    }

    closePlanningPanels(document);

    const civ = deps.currentCiv();
    const sciencePerTurn = Math.max(1, calculateCivResearchOutput(session.getState(), civId).finalScience);
    const researchChoices = missingResearch
      ? getAvailableTechs(civ.techState).slice(0, 3).map(tech => ({
        techId: tech.id,
        label: tech.name,
        turns: estimateTurnsToComplete({ cost: getEffectiveTechCost(tech, civ.techState.completed), outputPerTurn: sciencePerTurn }),
      }))
      : [];

    const cityChoices = idleCityIds
      .map(cityId => {
        const city = session.getState().cities[cityId];
        const choice = getRecommendedIdleCityChoice(session.getState(), civId, cityId);
        if (!city || !choice) {
          return null;
        }
        return {
          cityId,
          cityName: city.name,
          itemId: choice.itemId,
          label: choice.label,
          turns: choice.turns,
        };
      })
      .filter((choice): choice is NonNullable<typeof choice> => choice !== null);

    deps.setBlockingOverlay('required-choice');
    createRequiredChoicePanel(uiLayer, {
      researchChoices,
      cityChoices,
      onChooseResearch: (techId) => {
        const civ = deps.currentCiv();
        session.commit({
          ...session.getState(),
          civilizations: {
            ...session.getState().civilizations,
            [session.getState().currentPlayer]: { ...civ, techState: enqueueResearch(civ.techState, techId) },
          },
        });
        deps.showNotification(`Researching ${techId}...`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onChooseCityBuild: (cityId, itemId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        session.commit({
          ...session.getState(),
          cities: { ...session.getState().cities, [cityId]: enqueueCityProduction(city, itemId) },
        });
        deps.showNotification(`${city.name}: queued ${itemId}`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onOpenTech: () => {
        closeRequiredChoicePanel();
        router.open('tech');
      },
      onOpenCity: (cityId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        closeRequiredChoicePanel();
        deps.openCityPanelForCity(city);
      },
    });
    return true;
  }

  function maybeShowCouncilInterrupt(): void {
    const state = session.getState();
    if (!state) {
      return;
    }
    const interrupt = getCouncilInterrupt(state, state.currentPlayer, state.settings.councilTalkLevel);
    if (!interrupt) {
      return;
    }
    if (state.hotSeat && state.pendingEvents && interrupt.civId !== state.currentPlayer) {
      collectCouncilInterrupt(state.pendingEvents, interrupt.civId, interrupt, state.turn);
      return;
    }
    deps.showNotification(interrupt.summary, 'info');
  }

  function finalizePendingCityCaptureChoice(
    disposition: 'occupy' | 'raze',
    attackerBonus?: CivBonusEffect,
  ): void {
    const captureIntent = selection.getPendingIntent();
    if (captureIntent.kind !== 'city-capture') return;

    const pending = captureIntent.choice;
    const cityBeforeResolution = session.getState().cities[pending.cityId];
    const previousOwner = cityBeforeResolution?.owner ?? '';
    const cityName = cityBeforeResolution?.name ?? pending.cityId;
    const beforeCapture = session.getState();
    const result = finalizePlayerCityAssaultChoice(session.getState(), pending, disposition, session.getState().turn, bus);

    selection.setPendingIntent({ kind: 'none' });
    deps.getElementById('city-capture-panel')?.remove();
    session.setStateWithoutRefresh(result.state);
    emitMajorCityCaptureEvents(
      beforeCapture,
      result,
      pending.cityId,
      session.getState().currentPlayer,
      previousOwner,
      bus,
    );

    if (result.outcome === 'occupied') {
      const capturingCiv = deps.currentCiv();
      if (capturingCiv && attackerBonus?.type === 'naval_raiding') {
        capturingCiv.gold += 30;
        deps.showNotification('Viking raid spoils! +30 gold', 'success');
      }
      deps.showNotification(`We have captured ${cityName}!`, 'success');
    } else {
      deps.showNotification(`${cityName} was razed! +${result.goldAwarded} gold`, 'success');
    }

    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    setTimeout(() => deps.selectNextUnit(), 400);
  }

  function handleVictoryIfNeeded(): boolean {
    const state = session.getState();
    if (!state.gameOver) return false;
    const winnerCiv = state.winner
      ? state.civilizations[state.winner]
      : undefined;
    const winnerName = winnerCiv?.name ?? state.winner ?? '';
    const outcome = state.winner === state.currentPlayer ? 'victory' : 'defeat';
    deps.setBlockingOverlay('victory');
    showVictoryPanel(uiLayer, {
      winnerName,
      victoryType: outcome === 'victory' ? 'Domination Victory' : 'Campaign Defeat',
      outcome,
      reason: state.gameOverReason ?? 'domination',
      turn: state.turn,
      onNewGame: () => {
        deps.getElementById('victory-panel')?.remove();
        deps.setBlockingOverlay(null);
        deps.showGameModeSelection();
      },
    });
    return true;
  }

  function captureAIMoves(fn: () => void): AIMoveRecord[] {
    const moves: AIMoveRecord[] = [];
    const unsub = bus.on('unit:move', ({ presentationByViewer }) => {
      for (const [viewerId, presentation] of Object.entries(presentationByViewer)) {
        moves.push({
          unit: structuredClone(presentation.unit),
          viewerId,
          visibleSegments: structuredClone(presentation.visibleSegments),
        });
      }
    });
    fn();
    unsub();
    return moves;
  }

  async function replayAIMoves(moves: AIMoveRecord[]): Promise<void> {
    if (roundPresentationGate.isSuppressed()) return;
    const visibleMoves = moves
      .filter(move => move.viewerId === session.getState().currentPlayer)
      .slice(0, 6);
    for (const { unit, visibleSegments } of visibleMoves) {
      for (const path of visibleSegments.filter(segment => segment.length >= 2)) {
        if (roundPresentationGate.isSuppressed() || session.getState().currentPlayer !== visibleMoves[0]?.viewerId) return;
        await new Promise<void>(resolve => renderLoop.animateUnitMove(
          { ...unit, position: path[0]! },
          path,
          resolve,
        ));
      }
    }
  }

  function runCurrentCompletedRound(state: GameState): CompletedRoundResult {
    return runCompletedRound(state, bus, {
      improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
      majors: (current, eventBus) => processNonHumanMajorRound(current, eventBus).state,
      world: (current, eventBus) => processTurn(current, eventBus),
      postprocess: (beforeRound, current, eventBus) => {
        const afterStrategic = applyStrategicWarningTransitions(beforeRound, current, eventBus);
        applySupplyWarningTransitions(beforeRound, afterStrategic, eventBus);
        return afterStrategic;
      },
    });
  }

  function emitCurrentPlayerAudioSnapshot(civId: string): void {
    const civ = session.getState().civilizations[civId];
    const cities = Object.values(session.getState().cities).filter(city => city.owner === civId);
    bus.emit('currentPlayer:changed-after-handoff', {
      civId,
      civType: civ?.civType ?? civId,
      era: session.getState().era,
      atWarCount: civ?.diplomacy?.atWarWith?.length ?? 0,
      unrestCityCount: cities.filter(city => city.unrestLevel > 0).length,
      nearDefeat: civ?.nearDefeat ?? false,
      inBeastTerritory: isCivUnitInBeastTerritory(session.getState(), civId),
    });
  }

  /** Opens due Exploit warnings only after the human viewer's identity has been confirmed. */
  function beginNetworkPlansForCurrentViewer(): void {
    const viewerId = session.getState().currentPlayer;
    if (!session.getState().civilizations[viewerId]?.isHuman) return;
    const result = beginNetworkPlansForVictimTurn(session.getState(), viewerId);
    session.setStateWithoutRefresh(result.state);
    for (const warning of result.warnings) {
      const plan = Object.values(session.getState().autonomyByCiv ?? {})
        .map(autonomy => autonomy.plans[warning.planId])
        .find(Boolean);
      if (plan?.target.kind !== 'city') continue;
      bus.emit('network:exploit-warning', {
        planId: warning.planId,
        victimCivId: viewerId,
        cityId: plan.target.cityId,
      });
    }
  }

  function centerOnCurrentPlayer(): void {
    const units = Object.values(session.getState().units).filter(u => u.owner === session.getState().currentPlayer);
    if (units.length > 0) {
      renderLoop.camera.centerOn(units[0].position);
    }
  }

  /** Renamed from `releaseHandoffToViewer` -- see file docblock. */
  function enterViewerTurn(nextSlotId: string): void {
    centerOnCurrentPlayer();
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    deps.scanBeastSightings();
    deps.scanSubmarineSightings();
    deps.maybeShowPendingHoardChoice();
    deps.maybeShowPendingGeneralChoice();
    roundPresentationGate.resume();
    audio.setMasterVolume(userSettingsStore.getMasterVolume());
    deps.setBlockingOverlay(null);
    emitCurrentPlayerAudioSnapshot(nextSlotId);
    if (handleVictoryIfNeeded()) return;
    showRequiredChoicesIfNeeded();
  }

  /** These player-owned surfaces may contain strategic targets; never carry them across a hot-seat veil. */
  function closeNetworkPanelsForHandoff(): void {
    router.close('network');
    deps.getNetworkIntentPanel()?.remove();
  }

  async function beginHotSeatHandoff(
    hotSeat: NonNullable<GameState['hotSeat']>,
    completesRound: boolean,
  ): Promise<void> {
    const preSimulationState = session.getState();
    const previousHumanId = preSimulationState.currentPlayer;
    let resolvedNextSlotId = completesRound
      ? null
      : getNextActiveHumanPlayerId(preSimulationState, previousHumanId);
    const nextPlayer = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
    closePirateWatersPanels(uiLayer);
    closeNetworkPanelsForHandoff();
    // A discovery ceremony queued (or deferred by an in-flight move animation) at the
    // instant a player ends their turn must not survive to play on the next player's
    // screen once enterViewerTurn's setBlockingOverlay(null) pumps the queues.
    ceremonies.clearForHandoff();
    renderLoop.setSelectedPirateFactionId(null);
    // #545 MR8: the strike-target picker (panel + blast-radius map overlay)
    // is exactly the same class of "player-owned surface that may contain
    // strategic targets" the comment above already warns about -- it was
    // missing from this list.
    closeStrategicLaunchFlow(uiLayer);
    renderLoop.setStrategicLaunchPreview(null);
    audio.stopPirateAmbience('player-changed');
    audio.setMasterVolume(0);
    deps.setBlockingOverlay('turn-handoff');
    roundPresentationGate.suppress();
    const controller = showTurnHandoff(
      uiLayer,
      preSimulationState,
      resolvedNextSlotId,
      resolvedNextSlotId ? (nextPlayer?.name ?? 'Player') : null,
      {
        initiallyReady: false,
        preparingLabel: 'Preparing next turn…',
        onReady: async summary => {
          if (!resolvedNextSlotId) return;
          const acknowledgement = acknowledgeTurnHandoffSummary(
            session.getState(),
            resolvedNextSlotId,
            summary,
          );
          session.setStateWithoutRefresh(acknowledgement.state);
          beginNetworkPlansForCurrentViewer();
          let acknowledgementFailed = false;
          try {
            await autoSave(session.getState());
          } catch {
            acknowledgementFailed = true;
          }
          enterViewerTurn(resolvedNextSlotId);
          if (acknowledgement.playStrategicWarningAudio) {
            bus.emit('ai:strategic-warning-audio', {
              viewerId: resolvedNextSlotId,
              turn: summary.turn,
            });
          }
          if (acknowledgementFailed) {
            deps.showNotification('Turn opened, but its summary may repeat after reload.', 'warning');
          }
        },
      },
    );

    const returnToSaves = (): void => {
      roundPresentationGate.resume();
      deps.reloadPage();
    };

    const persistIntermediateHandoff = async (): Promise<void> => {
      try {
        await autoSave(session.getState());
        controller.setReady(session.getState());
      } catch {
        controller.setError(
          'The turn handoff could not be saved. Retry saving before opening the next turn.',
          {
            onRetry: () => void persistIntermediateHandoff(),
            onReturnToSaves: returnToSaves,
          },
        );
      }
    };

    if (!completesRound) {
      if (!resolvedNextSlotId) {
        session.setStateWithoutRefresh(resolveHotSeatPostSimulation(preSimulationState, previousHumanId).state);
        controller.remove();
        // #787 phase 12 (#794): release 'turn-handoff' explicitly before
        // handleVictoryIfNeeded() may push 'victory' -- an implicit
        // overwrite is safe under the old single-slot overlay, but leaves a
        // phantom entry on the reference-counted stack that never gets
        // popped, permanently blocking interaction after the player
        // dismisses the victory panel.
        deps.setBlockingOverlay(null);
        handleVictoryIfNeeded();
        return;
      }
      session.setStateWithoutRefresh(applyPendingChallengeForCiv(
        { ...preSimulationState, currentPlayer: resolvedNextSlotId },
        resolvedNextSlotId,
      ));
      void persistIntermediateHandoff();
      return;
    }

    const transaction = createCompletedRoundHandoffTransaction({
      initialState: preSimulationState,
      runCompletedRound: runCurrentCompletedRound,
      prepareCompletedState: state =>
        resolveHotSeatPostSimulation(state, previousHumanId).state,
      eventTarget: bus,
      adoptState: state => {
        session.setStateWithoutRefresh(state);
      },
      persistState: autoSave,
      onCommitErrors: errors => {
        if (errors.length > 0) {
          console.error('[handoff] Buffered presentation events failed to dispatch.', errors);
        }
      },
    });

    const persistCompletedHandoff = async (): Promise<void> => {
      const outcome = await transaction.persistCompletedRoundHandoff();
      if (outcome.status === 'ready') {
        if (outcome.state.gameOver) {
          controller.remove();
          // #787 phase 12 (#794): see the matching comment above -- release
          // 'turn-handoff' before handleVictoryIfNeeded() may push 'victory'.
          deps.setBlockingOverlay(null);
          handleVictoryIfNeeded();
          return;
        }
        resolvedNextSlotId = outcome.state.currentPlayer;
        const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
        controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
        return;
      }
      controller.setError(
        'The round finished, but the handoff could not be saved. Retry saving before opening the next turn.',
        {
          onRetry: () => void persistCompletedHandoff(),
          onReturnToSaves: returnToSaves,
        },
      );
    };

    const simulate = async (): Promise<void> => {
      // withHappenedTurn only needs to cover the synchronous commitTo() inside
      // runCompletedRoundSimulation (completed-round-handoff.ts) -- it runs
      // before that function's first await, so wrapping the whole (async) call
      // still stamps every event committed this round with the pre-round turn
      // (#551). If that commit ever moves after an await, thread the turn
      // through the transaction options instead.
      const outcome = await notifier.withHappenedTurn(
        preSimulationState.turn,
        () => transaction.runCompletedRoundSimulation(),
      );
      if (outcome.status === 'simulation-failed') {
        controller.setError(
          'The round could not be completed. Your turn is unchanged and was not autosaved.',
          {
            onRetry: () => void simulate(),
            onReturnToSaves: returnToSaves,
          },
        );
        return;
      }
      if (outcome.status === 'persistence-failed') {
        controller.setError(
          'The round finished, but the handoff could not be saved. Retry saving before opening the next turn.',
          {
            onRetry: () => void persistCompletedHandoff(),
            onReturnToSaves: returnToSaves,
          },
        );
        return;
      }
      if (outcome.state.gameOver) {
        controller.remove();
        // #787 phase 12 (#794): see the matching comment above -- release
        // 'turn-handoff' before handleVictoryIfNeeded() may push 'victory'.
        deps.setBlockingOverlay(null);
        handleVictoryIfNeeded();
        return;
      }
      resolvedNextSlotId = outcome.state.currentPlayer;
      const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
      controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
    };
    void simulate();
  }

  async function endTurn(options: { allowUnmovedUnits?: boolean } = {}): Promise<void> {
    if (session.getState().gameOver) return;
    try {
      if (showReligionBoonIfNeeded()) {
        deps.showNotification('Choose a boon for your religion before ending the turn.', 'info');
        return;
      }

      if (showRequiredChoicesIfNeeded()) {
        deps.showNotification('Choose production and research before ending the turn.', 'info');
        return;
      }

      if (!options.allowUnmovedUnits && deps.getUnitTurnFlow().showEndTurnUnitWarningIfNeeded()) {
        return;
      }

      SFX.endTurn();
      deps.deselectUnit();

      const hotSeat = session.getState().hotSeat;

      if (hotSeat) {
        await beginHotSeatHandoff(
          hotSeat,
          isActiveHumanRoundComplete(session.getState(), session.getState().currentPlayer),
        );
      } else {
        // --- Solo Mode ---
        const roundTurn = session.getState().turn;
        const result = runCurrentCompletedRound(session.getState());
        if (!result.ok) throw result.error;
        session.setStateWithoutRefresh(result.state);
        beginNetworkPlansForCurrentViewer();
        const soloMoves = captureAIMoves(() => {
          notifier.withHappenedTurn(roundTurn, () => {
            result.events.commitTo(bus);
          });
        });

        if (handleVictoryIfNeeded()) return;

        renderLoop.setGameState(session.getState());
        await replayAIMoves(soloMoves);
        deps.updateHUD();
        showRequiredChoicesIfNeeded();

        deps.showNotification(`Turn ${session.getState().turn}`, 'info');
        deps.checkAdvisors();

        await autoSave(session.getState());
        bus.emit('game:saved', { turn: session.getState().turn });
      }
    } catch (err) {
      console.error('endTurn error:', err);
      deps.showNotification('Error processing turn!', 'warning');
    }
  }

  return {
    endTurn,
    beginHotSeatHandoff,
    enterViewerTurn,
    closeNetworkPanelsForHandoff,
    beginNetworkPlansForCurrentViewer,
    runCurrentCompletedRound,
    captureAIMoves,
    replayAIMoves,
    handleVictoryIfNeeded,
    centerOnCurrentPlayer,
    emitCurrentPlayerAudioSnapshot,
    maybeShowCouncilInterrupt,
    showRequiredChoicesIfNeeded,
    showReligionBoonIfNeeded,
    refreshRequiredChoicesAfterAction,
    closeRequiredChoicePanel,
    finalizePendingCityCaptureChoice,
  };
}
