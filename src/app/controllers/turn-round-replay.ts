/**
 * Completed-round run and AI-move replay (#1243), split out of `turn-flow-controller.ts`. None of these
 * writes unpublished state; the `presentation-deferred` adoption stays in `endTurn`. Bodies verbatim.
 */
import type { GameState } from '@/core/types';
import { emitMinorCivLeagueNotices } from '@/systems/minor-civ-league-presentation';
import { reconcileMinorCivLeagues } from '@/systems/minor-civ-league-system';
import { runCompletedRound, type CompletedRoundResult } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processTurn } from '@/core/turn-manager';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import { applySupplyWarningTransitions } from '@/systems/supply-warning-system';
import type { TurnFlowController, TurnFlowControllerDeps, AIMoveRecord } from './turn-flow-shared';

export interface TurnRoundReplay {
  captureAIMoves: TurnFlowController['captureAIMoves'];
  replayAIMoves: TurnFlowController['replayAIMoves'];
  runCurrentCompletedRound: TurnFlowController['runCurrentCompletedRound'];
}

export function createTurnRoundReplay(deps: TurnFlowControllerDeps): TurnRoundReplay {
  const { session, renderLoop, bus, roundPresentationGate } = deps;

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
        const afterCompacts = reconcileMinorCivLeagues(afterStrategic);
        applySupplyWarningTransitions(beforeRound, afterCompacts, eventBus);
        emitMinorCivLeagueNotices(beforeRound, afterCompacts, eventBus);
        return afterCompacts;
      },
    });
  }

  return { captureAIMoves, replayAIMoves, runCurrentCompletedRound };
}
