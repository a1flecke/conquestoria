import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { appendLegendaryWonderNetworkPlanResolutions } from '@/systems/legendary-wonder-history';

describe('legendary-wonder history', () => {
  it('appends supplied owner-turn resolution facts once while preserving the host city', () => {
    const state = createNewGame('rome', 'wonder-history', 'small');
    const cityId = state.civilizations.player.cities[0]!;
    const resolution = { civId: 'player', planId: 'mesh', definitionId: 'research-mesh', cityId, stable: true, turn: state.turn };

    const recorded = appendLegendaryWonderNetworkPlanResolutions(state, [resolution]);
    expect(recorded.legendaryWonderHistory?.networkPlanResolutions).toEqual([
      resolution,
    ]);
    expect(appendLegendaryWonderNetworkPlanResolutions(recorded, [resolution])).toEqual(recorded);
  });

  it('does not infer a resolution from an active plan when supplied no facts', () => {
    const state = createNewGame('rome', 'wonder-history-no-inference', 'small');
    const cityId = state.civilizations.player.cities[0]!;
    state.autonomyByCiv!.player.plans.mesh = {
      id: 'mesh', ownerCivId: 'player', definitionId: 'research-mesh',
      source: { kind: 'city', cityId }, target: { kind: 'city', cityId },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    expect(appendLegendaryWonderNetworkPlanResolutions(state, [])).toBe(state);
  });
});
