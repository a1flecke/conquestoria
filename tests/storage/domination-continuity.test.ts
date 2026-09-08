import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processTurn } from '@/core/turn-manager';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import type { GameState } from '@/core/types';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { withoutOwnedAssets } from '../systems/helpers/civilization-liveness-fixture';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

function candidateState(): GameState {
  const bus = new EventBus();
  const pending = applyDiplomaticAction(
    makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
  );
  return withoutOwnedAssets(
    acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus),
    'third',
  );
}

function runOneRealRound(state: GameState): GameState {
  const result = runCompletedRound(state, new EventBus(), {
    improvements: processImprovementTurns,
    majors: (current, bus) => processNonHumanMajorRound(current, bus).state,
    world: processTurn,
  });
  if (!result.ok) throw result.error;
  return result.state;
}

function reload(state: GameState): GameState {
  const saved = parseSaveFile(serializeSaveFile(state));
  if (saved.status !== 'success') throw new Error(saved.message);
  return normalizeLoadedState(saved.state);
}

describe('domination save continuity', () => {
  it('preserves a final vassalization round across export, import, and real round processing', () => {
    const beforeFinalRound = normalizeLoadedState(candidateState());
    const uninterrupted = runOneRealRound(structuredClone(beforeFinalRound));
    const continued = runOneRealRound(reload(beforeFinalRound));

    assertSimulationEquivalent(continued, uninterrupted, 'Domination final round');
    expect(continued).toMatchObject({
      winner: 'overlord',
      gameOver: true,
      gameOverReason: 'domination',
      turn: beforeFinalRound.turn + 1,
    });
  });

  it('preserves a near miss across export, import, and real round processing', () => {
    const beforeRound = normalizeLoadedState(makeVassalageFixture());
    const uninterrupted = runOneRealRound(structuredClone(beforeRound));
    const continued = runOneRealRound(reload(beforeRound));

    assertSimulationEquivalent(continued, uninterrupted, 'Domination near miss');
    expect(continued.gameOver).toBe(false);
    expect(continued.winner).toBeNull();
  });

  it('preserves a pending independence veto across export, import, and the final round', () => {
    const candidate = candidateState();
    candidate.civilizations.overlord.units = [];
    const pending = applyDiplomaticAction(
      candidate, 'vassal', 'overlord', 'petition_independence', new EventBus(),
    );
    const beforeRound = normalizeLoadedState(pending);
    const uninterrupted = runOneRealRound(structuredClone(beforeRound));
    const continued = runOneRealRound(reload(beforeRound));

    assertSimulationEquivalent(continued, uninterrupted, 'Domination pending independence');
    expect(continued.pendingDiplomacyRequests).toContainEqual(expect.objectContaining({
      type: 'independence',
      fromCivId: 'vassal',
      toCivId: 'overlord',
    }));
    expect(continued.gameOver).toBe(false);
    expect(continued.winner).toBeNull();
  });
});
