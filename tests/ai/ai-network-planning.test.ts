import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City } from '@/core/types';
import { getNetworkPlanCandidates, planNetworkTurn } from '@/ai/ai-network-planning';

function city(id: string, owner: string): City {
  return {
    id, name: id, owner, position: { q: 0, r: 0 }, population: 1, food: 0, foodNeeded: 10,
    buildings: ['smart_grid'], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

describe('AI network planning', () => {
  it('generates deterministic, validator-approved constructive candidates and assigns one without a numeric bonus', () => {
    const state = createNewGame('rome', 'ai-network', 'small');
    const aiCity = city('ai-city', 'ai-1');
    state.cities = { [aiCity.id]: aiCity };
    state.civilizations['ai-1'] = {
      ...state.civilizations['ai-1'], cities: [aiCity.id],
      techState: { ...state.civilizations['ai-1'].techState, completed: ['quantum-computing'] },
    };

    const candidates = getNetworkPlanCandidates(state, 'ai-1');
    expect(candidates.map(candidate => candidate.request.definitionId)).toEqual(['fabrication-sprint']);
    expect(planNetworkTurn(state, 'ai-1')).toEqual(planNetworkTurn(state, 'ai-1'));
    expect(Object.values(planNetworkTurn(state, 'ai-1').autonomyByCiv!['ai-1'].plans)).toHaveLength(1);
  });
});
