import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City } from '@/core/types';
import { getNetworkPanelModel } from '@/ui/network-panel';

function city(): City {
  return {
    id: 'city-player', name: 'Roma', owner: 'player', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings: ['smart_grid'], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
    unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

describe('network panel model', () => {
  it('is hidden before activation and exposes every currently actionable city plan after activation', () => {
    const state = createNewGame('rome', 'network-panel', 'small');
    state.cities = { 'city-player': city() };
    state.civilizations.player.cities = ['city-player'];

    expect(getNetworkPanelModel(state, 'player')).toMatchObject({ active: false, candidates: [] });
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const model = getNetworkPanelModel(state, 'player');

    expect(model.statusText).toBe('Network: Stable · 0/2');
    expect(model.candidates.find(candidate => candidate.request.definitionId === 'fabrication-sprint')).toMatchObject({ enabled: true });
    expect(model.candidates.find(candidate => candidate.request.definitionId === 'research-mesh')).toMatchObject({ enabled: false });
  });
});
