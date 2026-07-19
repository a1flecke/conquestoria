import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getAutonomyCapacity, getAutonomyLoad } from '@/systems/autonomy-capacity';

describe('autonomy capacity', () => {
  it('is unavailable before the first Era 13 technology and grants base Capacity 2 after activation', () => {
    const state = createNewGame('rome', 'autonomy-capacity', 'small');

    expect(getAutonomyCapacity(state, 'player')).toEqual({ unrestricted: 0, restricted: {} });
    state.civilizations.player.techState.completed = ['quantum-computing'];
    expect(getAutonomyCapacity(state, 'player')).toEqual({ unrestricted: 2, restricted: {} });
    expect(getAutonomyLoad(state, 'player')).toEqual({ total: 0, unrestricted: 0, byCategory: {} });
  });

  it('caps precursor Capacity and applies diminishing Network Operations Centers', () => {
    const state = createNewGame('rome', 'autonomy-capacity-sources', 'small');
    state.civilizations.player.techState.completed = ['quantum-computing', 'quantum-networking'];
    const playerCities = Object.values(state.cities).filter(city => city.owner === 'player');
    const sourceCities = Array.from({ length: 5 }, (_, index) => ({
      ...playerCities[0]!,
      id: `network-city-${index}`,
      owner: 'player',
      buildings: index < 4
        ? ['data_center', 'network_operations_center']
        : ['network_operations_center'],
    }));
    state.cities = Object.fromEntries(sourceCities.map(city => [city.id, city]));
    state.civilizations.player.cities = sourceCities.map(city => city.id);

    expect(getAutonomyCapacity(state, 'player')).toEqual({ unrestricted: 14, restricted: {} });
  });

  it('uses definition Load rather than plan count and ignores completed plans', () => {
    const state = createNewGame('rome', 'autonomy-load', 'small');
    state.civilizations.player.techState.completed = ['quantum-computing'];
    state.autonomyByCiv!.player.plans = {
      fabrication: { id: 'fabrication', ownerCivId: 'player', definitionId: 'fabrication-sprint', source: { kind: 'city', cityId: 'city-1' }, target: { kind: 'city', cityId: 'city-1' }, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null },
      exploit: { id: 'exploit', ownerCivId: 'player', definitionId: 'exploit', sourceUnitId: 'unit-1', target: { kind: 'city', cityId: 'city-2' }, status: 'completed', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null },
    };

    expect(getAutonomyLoad(state, 'player')).toEqual({ total: 2, unrestricted: 2, byCategory: { infrastructure: 2 } });
  });
});
