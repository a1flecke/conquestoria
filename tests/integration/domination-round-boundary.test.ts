import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processTurn } from '@/core/turn-manager';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import { checkDominationVictory } from '@/systems/victory-system';
import { withoutOwnedAssets } from '../systems/helpers/civilization-liveness-fixture';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

function candidateState() {
  const bus = new EventBus();
  const pending = applyDiplomaticAction(
    makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
  );
  return withoutOwnedAssets(
    acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus),
    'third',
  );
}

describe('domination completed-round boundary', () => {
  it('checks victory only after later completed-round phases retain the candidate condition', () => {
    const bus = new EventBus();
    const startEvents: number[] = [];
    bus.on('turn:start', event => startEvents.push(event.turn));
    const initial = candidateState();

    const result = runCompletedRound(initial, bus, {
      improvements: current => {
        expect(checkDominationVictory(current)).toBe('overlord');
        return current;
      },
      majors: (current, eventBus) => applyDiplomaticAction(
        current, 'overlord', 'vassal', 'release_vassal', eventBus,
      ),
      world: current => processTurn(current, bus),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.state.gameOver).toBe(false);
    expect(startEvents).toEqual([initial.turn + 1]);
    expect(result.state.turn).toBe(startEvents[0]);
  });

  it('marks a stable final candidate before the next turn:start event', () => {
    const bus = new EventBus();
    const startEvents: number[] = [];
    bus.on('turn:start', event => startEvents.push(event.turn));
    const initial = candidateState();

    const result = processTurn(initial, bus);

    expect(result).toMatchObject({
      gameOver: true,
      winner: 'overlord',
      gameOverReason: 'domination',
      turn: initial.turn + 1,
    });
    expect(startEvents).toEqual([result.turn]);
  });
});
