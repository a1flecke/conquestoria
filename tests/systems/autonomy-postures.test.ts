import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  advanceAutonomySurge,
  applyPendingAutonomyPosture,
  beginAutonomySurge,
  requestAutonomyPosture,
} from '@/systems/autonomy-postures';

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

  it('does not allow another posture change for three owner rounds after application', () => {
    const state = createNewGame('rome', 'autonomy-posture-cooldown', 'small');
    const requested = requestAutonomyPosture(state, 'player', 'accelerated');
    const applied = applyPendingAutonomyPosture({ ...requested, turn: 2 }, 'player');

    const beforeCooldownEnds = { ...applied, turn: 4 };
    expect(requestAutonomyPosture(beforeCooldownEnds, 'player', 'safeguarded')).toBe(beforeCooldownEnds);
    expect(requestAutonomyPosture({ ...applied, turn: 5 }, 'player', 'safeguarded').autonomyByCiv!.player.pendingPosture)
      .toEqual({ id: 'safeguarded', appliesOnTurn: 6 });
  });

  it('allows one Integrated Surge, applies a two-round recovery, then a four-round cooldown', () => {
    const state = createNewGame('rome', 'autonomy-surge', 'small');
    state.civilizations.player.techState.completed = ['quantum-computing'];
    state.autonomyByCiv!.player.plans.fabrication = {
      id: 'fabrication', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId: 'city-1' }, target: { kind: 'city', cityId: 'city-1' },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    const surged = beginAutonomySurge(state, 'player', 'fabrication');
    expect(surged.validation).toEqual({ ok: true });
    expect(surged.state.autonomyByCiv!.player.plans.fabrication.surgeResolutionTurn).toBe(1);
    expect(surged.state.autonomyByCiv!.player.surgeRecoveryUntilTurn).toBe(3);
    expect(beginAutonomySurge(surged.state, 'player', 'fabrication').validation).toEqual({ ok: false, reason: 'surge-unavailable' });

    const recovered = advanceAutonomySurge({ ...surged.state, turn: 3 }, 'player');
    expect(recovered.autonomyByCiv!.player).toMatchObject({ surgeRecoveryUntilTurn: null, surgeCooldownUntilTurn: 7 });
  });
});
