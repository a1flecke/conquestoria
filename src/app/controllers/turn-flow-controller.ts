/** Turn advancement: `endTurn`, the hot-seat handoff, and entering a viewer's turn. The other slices are in `turn-*.ts`. */
import type { GameState } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { autoSave } from '@/storage/save-manager';
import {
  getNextActiveHumanPlayerId,
  isActiveHumanRoundComplete,
} from '@/core/turn-cycling';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';
import { acknowledgeTurnHandoffSummary, showTurnHandoff } from '@/ui/turn-handoff';
import { closePirateWatersPanels } from '@/ui/pirate-waters-panel';
import { closeStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { beginNetworkPlansForVictimTurn } from '@/systems/network-plan-system';
import { recordAssessmentDigest } from '@/systems/assessment-history';
import { applyPendingChallengeForCiv } from '@/core/opponent-challenge';
import { createCompletedRoundHandoffTransaction } from '@/core/completed-round-handoff';
import { createTurnRequiredChoices } from './turn-required-choices';
import { createTurnCityCapture } from './turn-city-capture';
import { createTurnPresentation } from './turn-presentation';
import { createTurnRoundReplay } from './turn-round-replay';
import type { TurnFlowController, TurnFlowControllerDeps } from './turn-flow-shared';

export type { TurnFlowController, TurnFlowControllerDeps, TurnFlowRenderer, TurnFlowAudio } from './turn-flow-shared';

export function createTurnFlowController(deps: TurnFlowControllerDeps): TurnFlowController {
  const { session, unpublished, selection, renderLoop, bus, uiLayer, audio, router, roundPresentationGate, ceremonies, notifier, userSettingsStore } = deps;

  const requiredChoices = createTurnRequiredChoices(deps);
  const cityCapture = createTurnCityCapture(deps);
  const presentation = createTurnPresentation(deps);
  const roundReplay = createTurnRoundReplay(deps);
  const slices = { ...requiredChoices, ...cityCapture, ...presentation, ...roundReplay };
  const {
    showRequiredChoicesIfNeeded, showReligionBoonIfNeeded, handleVictoryIfNeeded, centerOnCurrentPlayer,
    emitCurrentPlayerAudioSnapshot, runCurrentCompletedRound, captureAIMoves, replayAIMoves,
  } = slices;

  /** Opens due Exploit warnings only after the human viewer's identity has been confirmed. */
  function beginNetworkPlansForCurrentViewer(): void {
    const viewerId = session.getState().currentPlayer;
    if (!session.getState().civilizations[viewerId]?.isHuman) return;
    const result = beginNetworkPlansForVictimTurn(session.getState(), viewerId);
    unpublished.adopt(result.state, 'presentation-deferred');
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

  /** From a handoff starting until a seat is revealed or the game concludes. */
  let handoffVeiled = false;

  function enterViewerTurn(nextSlotId: string): void {
    handoffVeiled = false;
    centerOnCurrentPlayer();
    session.commit(session.getState());
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

  /**
   * Closes everything the outgoing seat can see: both panel-registry groups, then the decision modals and
   * overlays that live outside the registry. Pending decision records survive; only their DOM goes.
   */
  function closePanelsForHandoff(): void {
    router.closeGroup('main');
    router.closeGroup('transient');
    deps.closeVictoryProgressPanel();
    uiLayer.querySelector('#diplomacy-panel')?.remove();
    uiLayer.querySelector('#beast-hoard-panel')?.remove();
    uiLayer.querySelector('#general-candidate-panel')?.remove();
    uiLayer.querySelector('#beast-sighting-banner')?.remove();
    deps.getElementById('capture-verdict-modal')?.remove();
    deps.getElementById('intel-modal')?.remove();
    deps.getNetworkIntentPanel()?.remove();
  }

  async function beginHotSeatHandoff(
    hotSeat: NonNullable<GameState['hotSeat']>,
    completesRound: boolean,
  ): Promise<void> {
    const preSimulationState = session.getState();
    const previousHumanId = preSimulationState.currentPlayer;
    handoffVeiled = true;
    let resolvedNextSlotId = completesRound
      ? null
      : getNextActiveHumanPlayerId(preSimulationState, previousHumanId);
    const nextPlayer = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
    closePirateWatersPanels(uiLayer);
    closePanelsForHandoff();
    ceremonies.clearForHandoff();
    renderLoop.setSelectedPirateFactionId(null);
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
          unpublished.adopt(acknowledgement.state, 'viewer-not-yet-revealed');
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

    /** A handoff that ends in the game's conclusion: unmute and unsuppress before the shared conclusion screen. */
    const concludeHandoff = (): void => {
      handoffVeiled = false;
      roundPresentationGate.resume();
      audio.setMasterVolume(userSettingsStore.getMasterVolume());
      deps.setBlockingOverlay(null);
      handleVictoryIfNeeded();
    };

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
        unpublished.adopt(resolveHotSeatPostSimulation(preSimulationState, previousHumanId).state, 'viewer-not-yet-revealed');
        controller.remove();
        concludeHandoff();
        return;
      }
      unpublished.adopt(applyPendingChallengeForCiv(
        { ...preSimulationState, currentPlayer: resolvedNextSlotId },
        resolvedNextSlotId,
      ), 'viewer-not-yet-revealed');
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
        unpublished.adopt(state, 'viewer-not-yet-revealed');
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
          concludeHandoff();
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
        concludeHandoff();
        return;
      }
      resolvedNextSlotId = outcome.state.currentPlayer;
      const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
      controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
    };
    void simulate();
  }

  /** A solo round that was adopted but not saved; the next End Turn retries the save before any new round. Keyed by playthrough. */
  let unsavedSoloRound: { playthroughId: string | undefined } | null = null;

  async function persistSoloRound(): Promise<boolean> {
    const state = session.getState();
    unsavedSoloRound = { playthroughId: state.playthroughId };
    try {
      await autoSave(state);
    } catch (err) {
      console.error('[endTurn] completed round could not be saved:', err);
      deps.showNotification(
        `Turn ${state.turn} could not be saved. End Turn will retry the save before the next round.`,
        'warning',
      );
      return false;
    }
    unsavedSoloRound = null;
    bus.emit('game:saved', { turn: state.turn });
    return true;
  }

  /** Retries the pending save; true when nothing is left unsaved. */
  async function retryUnsavedSoloRound(): Promise<boolean> {
    if (!unsavedSoloRound) return true;
    if (unsavedSoloRound.playthroughId !== session.getState().playthroughId) {
      unsavedSoloRound = null;
      return true;
    }
    return persistSoloRound();
  }

  async function presentSoloRound(result: Extract<ReturnType<typeof runCurrentCompletedRound>, { ok: true }>, roundTurn: number): Promise<void> {
    beginNetworkPlansForCurrentViewer();
    const soloMoves = captureAIMoves(() => {
      notifier.withHappenedTurn(roundTurn, () => {
        const errors = result.events.commitTo(bus);
        if (errors.length > 0) console.error('[endTurn] Buffered round events failed to dispatch.', errors);
      });
    });

    if (handleVictoryIfNeeded()) {
      session.commit(session.getState());
      return;
    }

    renderLoop.setGameState(session.getState());
    await replayAIMoves(soloMoves);
    deps.updateHUD();
    deps.maybeShowPendingHoardChoice();
    deps.maybeShowPendingGeneralChoice();
    showRequiredChoicesIfNeeded();

    deps.showNotification(`Turn ${session.getState().turn}`, 'info');
    deps.checkAdvisors();
  }

  async function performEndTurn(options: { allowUnmovedUnits?: boolean } = {}): Promise<void> {
    if (handoffVeiled) return;
    if (unsavedSoloRound && !(await retryUnsavedSoloRound())) return;
    if (session.getState().gameOver) return;
    if (selection.getPendingIntent().kind === 'city-capture') {
      deps.showNotification('Choose whether to occupy or raze the captured city before ending the turn.', 'info');
      return;
    }
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

      session.update(state => recordAssessmentDigest(state, state.currentPlayer));

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
        if (!result.ok) {
          console.error('[endTurn] completed round simulation failed:', result.error);
          deps.showNotification('The turn could not be completed. Your turn is unchanged; try End Turn again.', 'warning');
          return;
        }
        unpublished.adopt(result.state, 'presentation-deferred');
        try {
          await presentSoloRound(result, roundTurn);
        } catch (err) {
          console.error('[endTurn] presenting the completed round failed:', err);
          session.commit(session.getState());
          deps.showNotification(`Turn ${session.getState().turn} began, but part of its display failed.`, 'warning');
        }
        await persistSoloRound();
      }
    } catch (err) {
      console.error('endTurn error:', err);
      deps.showNotification('Error processing turn!', 'warning');
    }
  }

  let endTurnInFlight: Promise<void> | null = null;

  function endTurn(options: { allowUnmovedUnits?: boolean } = {}): Promise<void> {
    if (endTurnInFlight) return endTurnInFlight;

    const execution = performEndTurn(options);
    const flight = execution.finally(() => {
      if (endTurnInFlight === flight) endTurnInFlight = null;
    });
    endTurnInFlight = flight;
    return flight;
  }

  return {
    ...slices,
    endTurn,
    beginHotSeatHandoff,
    enterViewerTurn,
    closePanelsForHandoff,
    beginNetworkPlansForCurrentViewer,
  };
}
