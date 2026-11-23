/** Turn-boundary presentation: council interrupt, victory ceremony routing, audio snapshot, camera centering. */
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
    // The one announcement that a game has ended (game-end music, stingers, ambience), carrying the
    // verdict the outcome screen shows, so audio and the panel cannot disagree about who won.
    bus.emit('game:over', { outcome: outcome.outcome });
    // Queued behind any ceremony that is presenting; the coordinator drops the backlog.
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
      // The raw count on purpose, city-state wars included: it seeds `AudioSystem`'s own `remainingWars`.
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
