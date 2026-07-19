import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { applyPendingAutonomyPosture, requestAutonomyPosture } from '@/systems/autonomy-postures';

describe('autonomy postures', () => {
  it('defers a posture change until the owner round boundary', () => {
    const state = createNewGame('rome', 'autonomy-posture', 'small');
    const requested = requestAutonomyPosture(state, 'player', 'accelerated');

    expect(requested.autonomyByCiv!.player).toMatchObject({
      posture: 'integrated', pendingPosture: { id: 'accelerated', appliesOnTurn: state.turn + 1 },
    });
    expect(applyPendingAutonomyPosture(requested, 'player')).toBe(requested);
    const applied = applyPendingAutonomyPosture({ ...requested, turn: state.turn + 1 }, 'player');
    expect(applied.autonomyByCiv!.player).toMatchObject({ posture: 'accelerated', pendingPosture: null });
  });
});
