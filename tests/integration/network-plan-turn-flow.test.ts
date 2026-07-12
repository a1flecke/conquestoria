import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import {
  assignNetworkPlan,
  beginNetworkPlansForVictimTurn,
  resolveNetworkPlansForVictimTurnEnd,
} from '@/systems/network-plan-system';

function makePreparedExploit() {
  const state = createNewGame('rome', 'network-plan-turn-flow', 'small');
  const city: City = {
    id: 'city-ai', name: 'Target', owner: 'ai-1', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
    unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  const cyber: Unit = {
    id: 'unit-cyber', type: 'cyber_unit', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  state.cities = { [city.id]: city };
  state.units = { [cyber.id]: cyber };
  state.civilizations.player = {
    ...state.civilizations.player,
    units: [cyber.id],
    techState: { ...state.civilizations.player.techState, completed: ['quantum-computing'] },
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'],
    cities: [city.id],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  return assignNetworkPlan(state, {
    ownerCivId: 'player', sourceUnitId: cyber.id, definitionId: 'exploit', target: { kind: 'city', cityId: city.id },
  }).state;
}

describe('network plan turn flow', () => {
  it('warns at victim-turn start and resolves only after that full response turn', () => {
    const prepared = makePreparedExploit();
    prepared.turn = 2;

    const warned = beginNetworkPlansForVictimTurn(prepared, 'ai-1');
    const resolved = resolveNetworkPlansForVictimTurnEnd(
      warned.state,
      'ai-1',
      { 'city-ai': 20 },
    );

    expect(warned.warnings).toEqual([{ planId: 'network-plan-1', victimCivId: 'ai-1' }]);
    expect(warned.state.autonomyByCiv!.player.plans['network-plan-1'].warnedTurn).toBe(2);
    expect(resolved.creditsByOwner).toEqual({ player: 2 });
  });

  it('does not resolve an un-warned prepared Exploit at victim-turn end', () => {
    const prepared = makePreparedExploit();
    prepared.turn = 2;

    const resolved = resolveNetworkPlansForVictimTurnEnd(prepared, 'ai-1', { 'city-ai': 20 });

    expect(resolved.creditsByOwner).toEqual({});
    expect(resolved.events).toEqual([]);
  });
});
