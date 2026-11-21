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
 *
 * #1243 split this by use case (the #1242 pattern). The hot-seat handoff, `endTurn` and the adoption of
 * unpublished state (`presentation-deferred` / `viewer-not-yet-revealed`, pinned by content in
 * `architecture-boundaries.test.ts`) deliberately stay here untouched. The rest moved out:
 *   - `turn-required-choices.ts` -- idle-city / research chooser, religion-boon gate
 *   - `turn-city-capture.ts`     -- occupy / raze resolution
 *   - `turn-presentation.ts`     -- council interrupt, victory routing, audio snapshot, camera
 *   - `turn-round-replay.ts`     -- completed-round run, AI-move capture and replay
 *   - `turn-flow-shared.ts`      -- deps, public interface, shared types
 */
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
  // Bare names keep the pinned `presentation-deferred` pair (renderer push, `await replayAIMoves(...)`, HUD
  // push) textually identical to its pre-split form -- `architecture-boundaries.test.ts` pins it by content.
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

  /**
   * True from the moment a hot-seat handoff starts until a seat is revealed (or the game concludes).
   * Under the veil `currentPlayer` may already be the next seat, whose turn nobody is playing yet, so
   * no End Turn may run then: it would end that seat's turn (and run its round) before its player saw
   * it. Every UI entry point is already blocked under the veil (inert shell, `isInteractionBlocked`);
   * this is the mutation owner's own guard, since `endTurn`'s single-flight ends when the handoff starts.
   */
  let handoffVeiled = false;

  /** Renamed from `releaseHandoffToViewer` -- see file docblock. */
  function enterViewerTurn(nextSlotId: string): void {
    handoffVeiled = false;
    centerOnCurrentPlayer();
    // The viewer is revealed: publish the state adopted under the handoff veil
    // ('viewer-not-yet-revealed') to the renderer, HUD and panels in one step (#1015).
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
   * A hot-seat boundary hands the screen to a different viewer, and every open panel is a viewer-owned
   * surface: the outgoing seat's espionage roster, notification log, city production queues, council
   * advice, governance choices and earned-intel atlases are the incoming seat's leaks. The earlier
   * hand-picked list ("network panels") leaked exactly this way one panel at a time -- the strike-target
   * picker was #545's "missing from this list", and the espionage panel and notification log were still
   * missing when this became structural. Closing BOTH registry groups at the boundary removes the
   * "remember to add the next leaky panel" contract: a new panel joins the teardown by being registered,
   * and `closeGroup` is DOM-derived, so panels opened through the parameterized helpers close too.
   */
  function closePanelsForHandoff(): void {
    router.closeGroup('main');
    router.closeGroup('transient');
    // The victory-progress panel pins controller state beyond its DOM node.
    deps.closeVictoryProgressPanel();
    // Defense-in-depth, pinned by the #910 regression: the private diplomacy inbox
    // is removed at the DOM level even when the router slice cannot (a no-op router
    // mock keeps that test honest about exactly this layer's own teardown).
    uiLayer.querySelector('#diplomacy-panel')?.remove();
    // The network intent panel is created outside the panel registry.
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

    /**
     * The handoff ends in the game's conclusion rather than a next seat. The conclusion screen is
     * shared by every seat, so the handoff's mute and presentation suppression end here, before it is
     * presented; otherwise its music and stinger would play into a muted, suppressed mixer.
     */
    const concludeHandoff = (): void => {
      handoffVeiled = false;
      roundPresentationGate.resume();
      audio.setMasterVolume(userSettingsStore.getMasterVolume());
      // #787 phase 12 (#794): release 'turn-handoff' explicitly before
      // handleVictoryIfNeeded() may push 'victory' -- an implicit overwrite
      // leaves a phantom entry on the reference-counted stack that never gets
      // popped, permanently blocking interaction after the victory panel.
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
        concludeHandoff();
        return;
      }
      resolvedNextSlotId = outcome.state.currentPlayer;
      const recipient = hotSeat.players.find(player => player.slotId === resolvedNextSlotId);
      controller.setRecipient(outcome.state, resolvedNextSlotId, recipient?.name ?? 'Player');
    };
    void simulate();
  }

  /**
   * Solo end turn has three outcomes that must not share recovery: the simulation failed (nothing was
   * adopted; End Turn simulates again), presentation failed (the round is adopted; publish it and keep
   * going), or persistence failed (the round is adopted and shown but not durable). Only the last leaves
   * work behind, and it is recorded here so the next End Turn retries the save instead of running
   * another round on top of an unsaved one. Keyed by playthrough so a pending retry never follows the
   * player into a different campaign.
   */
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

  /** True when an earlier completed round is still not durable; retries its save and reports whether it is now. */
  async function retryUnsavedSoloRound(): Promise<boolean> {
    if (!unsavedSoloRound) return true;
    if (unsavedSoloRound.playthroughId !== session.getState().playthroughId) {
      unsavedSoloRound = null;
      return true;
    }
    return persistSoloRound();
  }

  /** Publication and presentation of a solo round that has already been adopted. Never decides persistence. */
  async function presentSoloRound(result: Extract<ReturnType<typeof runCurrentCompletedRound>, { ok: true }>, roundTurn: number): Promise<void> {
    beginNetworkPlansForCurrentViewer();
    const soloMoves = captureAIMoves(() => {
      notifier.withHappenedTurn(roundTurn, () => {
        const errors = result.events.commitTo(bus);
        if (errors.length > 0) console.error('[endTurn] Buffered round events failed to dispatch.', errors);
      });
    });

    if (handleVictoryIfNeeded()) {
      // The round was adopted unpublished so AI moves could be captured for replay;
      // a finished game replays nothing, but it must still publish (#1015).
      session.commit(session.getState());
      return;
    }

    // #1199: this is the one intentional presentation-deferred publication --
    // the renderer must show the new round before the captured AI moves replay,
    // and the HUD updates after the replay completes.
    renderLoop.setGameState(session.getState());
    await replayAIMoves(soloMoves);
    deps.updateHUD();
    // The round can leave the player a choice of their own: a Great General queued at round end, or a hoard
    // from a beast their unit slew while defending. Hot seat opens these when the seat's turn begins.
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

      // #1238: the one place the Council's "Since your last turn" baseline advances -- as this
      // civ leaves its turn, before the round changes anything. Never on Council open (see
      // assessment-history.ts). In hot seat each human reaches here for their own seat only.
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
        // From here the round is the campaign: a later failure is presentation or persistence, never a
        // reason to simulate it again.
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
