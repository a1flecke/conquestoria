/**
 * Turn-boundary presentation (#1243), split out of `turn-flow-controller.ts`: council interrupt, victory
 * ceremony routing (#993, via `ceremonies.enqueueVictory`), audio snapshot and camera centering. Bodies verbatim.
 */
import { worldAgeFromNumber } from '@/systems/era-types';
import { isCivUnitInBeastTerritory } from '@/systems/beast-system';
import { getCouncilInterrupt } from '@/systems/council-system';
import { collectCouncilInterrupt } from '@/core/hotseat-events';
import { projectDominationOutcome } from '@/systems/domination-presentation';
import { projectScienceVictoryOutcome } from '@/systems/science-victory-presentation';
import type { TurnFlowController, TurnFlowControllerDeps } from './turn-flow-shared';

export interface TurnPresentation {
  maybeShowCouncilInterrupt: TurnFlowController['maybeShowCouncilInterrupt'];
  handleVictoryIfNeeded: TurnFlowController['handleVictoryIfNeeded'];
  emitCurrentPlayerAudioSnapshot: TurnFlowController['emitCurrentPlayerAudioSnapshot'];
  centerOnCurrentPlayer: TurnFlowController['centerOnCurrentPlayer'];
}

export function createTurnPresentation(deps: TurnFlowControllerDeps): TurnPresentation {
  const { session, renderLoop, bus, ceremonies } = deps;

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

  function handleVictoryIfNeeded(): boolean {
    const state = session.getState();
    if (!state.gameOver) return false;
    const outcome = state.gameOverReason === 'science'
      ? projectScienceVictoryOutcome(state, state.hotSeat ? null : state.currentPlayer)
      : projectDominationOutcome(state, state.hotSeat ? null : state.currentPlayer);
    deps.closeVictoryProgressPanel();
    // #993: routed through the ceremony coordinator's shared big-moment engine
    // instead of an unconditional direct call -- this waits for a
    // currently-presenting wonder/legendary ceremony's own overlay to clear
    // first (see ceremony-coordinator.ts's docblock for the overlay-stacking
    // race this closes) and drops any backlog those ceremonies still had
    // queued, since none of it matters once the game is over.
    ceremonies.enqueueVictory({
      winnerName: outcome.winnerName,
      victoryType: outcome.sharedResult
        ? 'Campaign Finished'
        : state.gameOverReason === 'science'
          ? 'Science Victory'
          : outcome.outcome === 'victory' ? 'Domination Victory' : 'Campaign Defeat',
      outcome: outcome.outcome,
      reason: state.gameOverReason ?? 'domination',
      sharedResult: outcome.sharedResult,
      summary: outcome.summary,
      standings: outcome.standings,
      turn: state.turn,
      onNewGame: () => {
        deps.getElementById('victory-panel')?.remove();
        deps.showGameModeSelection();
      },
    });
    return true;
  }

  function emitCurrentPlayerAudioSnapshot(civId: string): void {
    const civ = session.getState().civilizations[civId];
    const cities = Object.values(session.getState().cities).filter(city => city.owner === civId);
    bus.emit('currentPlayer:changed-after-handoff', {
      civId,
      civType: civ?.civType ?? civId,
      era: worldAgeFromNumber(session.getState().era),
      // Deliberately the raw count (incl. city-state wars), unlike the #1041
      // "major wars only" surfaces. This only drives war ambience on/off in
      // AudioSystem; a city-state coalition war is a real military threat, so
      // martial ambience for it is intentional. AudioSystem also mutates this
      // as `remainingWars` off diplomacy bus events, so the seed and that
      // counter must stay the same shape — opponent-kind-aware war ambience is
      // a separate audio follow-up, not part of #1041.
      atWarCount: civ?.diplomacy?.atWarWith?.length ?? 0,
      unrestCityCount: cities.filter(city => city.unrestLevel > 0).length,
      nearDefeat: civ?.nearDefeat ?? false,
      inBeastTerritory: isCivUnitInBeastTerritory(session.getState(), civId),
    });
  }

  function centerOnCurrentPlayer(): void {
    const units = Object.values(session.getState().units).filter(u => u.owner === session.getState().currentPlayer);
    if (units.length > 0) {
      renderLoop.camera.centerOn(units[0].position);
    }
  }

  return { maybeShowCouncilInterrupt, handleVictoryIfNeeded, emitCurrentPlayerAudioSnapshot, centerOnCurrentPlayer };
}
