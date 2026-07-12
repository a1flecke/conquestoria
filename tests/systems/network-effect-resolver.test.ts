import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, Unit } from '@/core/types';
import { assignNetworkPlan } from '@/systems/network-plan-system';
import { resolveNetworkPlanAtTargetEnd } from '@/systems/network-effect-resolver';

function makeCity(id: string, owner: string, q: number, buildings: string[] = []): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 1, food: 0, foodNeeded: 10,
    buildings, productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0,
    spyUnrestBonus: 0, idleProduction: null,
  };
}

function makeCyberUnit(id: string, owner: string, q: number): Unit {
  return {
    id, type: 'cyber_unit', owner, position: { q, r: 0 }, movementPointsLeft: 3,
    health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
}

function makeExploitState(targetBuildings: string[] = []): GameState {
  const state = createNewGame('rome', 'network-effect-resolver', 'small');
  const target = makeCity('city-ai', 'ai-1', 0, targetBuildings);
  const source = makeCyberUnit('unit-cyber', 'player', 1);
  state.cities = { [target.id]: target };
  state.units = { [source.id]: source };
  state.civilizations.player = {
    ...state.civilizations.player,
    units: [source.id],
    techState: { ...state.civilizations.player.techState, completed: ['quantum-computing'] },
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'],
    cities: [target.id],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  const assigned = assignNetworkPlan(state, {
    ownerCivId: 'player', sourceUnitId: source.id, definitionId: 'exploit', target: { kind: 'city', cityId: target.id },
  });
  return assigned.state;
}

describe('network effect resolver', () => {
  it('transfers floor of the normal 10 percent base city gold', () => {
    const result = resolveNetworkPlanAtTargetEnd(makeExploitState(), 'network-plan-1', { baseCityGold: 19 });

    expect(result.events).toEqual([expect.objectContaining({ kind: 'exploit-resolved', goldTransferred: 1 })]);
    expect(result.creditsByOwner).toEqual({ player: 1 });
  });

  it('does not transfer gold from a zero-gold city', () => {
    const result = resolveNetworkPlanAtTargetEnd(makeExploitState(), 'network-plan-1', { baseCityGold: 0 });

    expect(result.events).toEqual([expect.objectContaining({ kind: 'exploit-resolved', goldTransferred: 0 })]);
    expect(result.creditsByOwner).toEqual({});
  });

  it('delays the first CDC-protected resolution then halves the next one', () => {
    const delayed = resolveNetworkPlanAtTargetEnd(
      makeExploitState(['cyber_defense_center']),
      'network-plan-1',
      { baseCityGold: 20 },
    );
    const resolved = resolveNetworkPlanAtTargetEnd(delayed.state, 'network-plan-1', { baseCityGold: 20 });

    expect(delayed.events).toEqual([expect.objectContaining({ kind: 'exploit-delayed', goldTransferred: 0 })]);
    expect(resolved.events).toEqual([expect.objectContaining({ kind: 'exploit-resolved', goldTransferred: 1 })]);
  });

  it('consumes one Harden charge to halve the remaining Exploit amount', () => {
    const state = makeExploitState();
    const hardener = makeCyberUnit('unit-hardener', 'ai-1', 1);
    state.units[hardener.id] = hardener;
    state.civilizations['ai-1'] = {
      ...state.civilizations['ai-1'],
      units: [hardener.id],
      techState: { ...state.civilizations['ai-1'].techState, completed: ['quantum-computing'] },
    };
    const hardened = assignNetworkPlan(state, {
      ownerCivId: 'ai-1', sourceUnitId: hardener.id, definitionId: 'harden', target: { kind: 'city', cityId: 'city-ai' },
    });

    const result = resolveNetworkPlanAtTargetEnd(hardened.state, 'network-plan-1', { baseCityGold: 20 });

    expect(result.events).toEqual([expect.objectContaining({ kind: 'exploit-resolved', goldTransferred: 1 })]);
    expect(result.state.autonomyByCiv!['ai-1'].plans['network-plan-2'].effectState?.hardenCharges).toBe(0);
  });
});
