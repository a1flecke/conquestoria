import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
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

  it('uses a Drone Controller for a validator-approved formation plan when friendly combat units are in range', () => {
    const state = createNewGame('rome', 'ai-network-controller', 'small');
    const aiCity = city('ai-city', 'ai-1');
    const controller: Unit = {
      id: 'controller', type: 'drone_controller', owner: 'ai-1', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const escort: Unit = { ...controller, id: 'escort', type: 'exosuit_infantry', position: { q: 1, r: 0 } };
    state.cities = { [aiCity.id]: aiCity };
    state.units = { controller, escort };
    state.civilizations['ai-1'] = {
      ...state.civilizations['ai-1'], cities: [aiCity.id], units: ['controller', 'escort'],
      techState: { ...state.civilizations['ai-1'].techState, completed: ['quantum-computing'] },
    };

    const candidates = getNetworkPlanCandidates(state, 'ai-1');
    expect(candidates.map(candidate => candidate.request.definitionId)).toContain('guardian-screen');
    const assigned = planNetworkTurn(state, 'ai-1').autonomyByCiv!['ai-1'].plans['network-plan-1']!;
    expect(assigned.sourceUnitId).toBe('controller');
    expect(['guardian-screen', 'swarm-strike']).toContain(assigned.definitionId);
  });
});
