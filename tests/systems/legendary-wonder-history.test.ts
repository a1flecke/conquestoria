import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { recordStableConstructivePlanResolutions } from '@/systems/legendary-wonder-history';

describe('legendary-wonder history', () => {
  it('records each active constructive plan once per stable owner turn', () => {
    const state = createNewGame('rome', 'wonder-history', 'small');
    const cityId = state.civilizations.player.cities[0]!;
    state.autonomyByCiv!.player.plans.mesh = {
      id: 'mesh', ownerCivId: 'player', definitionId: 'research-mesh',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    const recorded = recordStableConstructivePlanResolutions(state, 'player');
    expect(recorded.legendaryWonderHistory?.networkPlanResolutions).toEqual([
      expect.objectContaining({ civId: 'player', planId: 'mesh', definitionId: 'research-mesh', stable: true, turn: state.turn }),
    ]);
    expect(recordStableConstructivePlanResolutions(recorded, 'player')).toEqual(recorded);
  });

  it('does not count constructive plans during Surge recovery', () => {
    const state = createNewGame('rome', 'wonder-history-recovery', 'small');
    const cityId = state.civilizations.player.cities[0]!;
    state.autonomyByCiv!.player.surgeRecoveryUntilTurn = state.turn + 1;
    state.autonomyByCiv!.player.plans.mesh = {
      id: 'mesh', ownerCivId: 'player', definitionId: 'research-mesh',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    expect(recordStableConstructivePlanResolutions(state, 'player')).toBe(state);
  });
});
