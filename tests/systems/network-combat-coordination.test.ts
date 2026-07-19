import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getNetworkCombatCoordination } from '@/systems/network-combat-coordination';

describe('network combat coordination', () => {
  it('applies the strongest active attack formation bonus without changing unit base strength', () => {
    const state = createNewGame('rome', 'network-combat', 'small');
    const [sourceId, targetId] = state.civilizations.player.units;
    state.units[sourceId] = { ...state.units[sourceId], type: 'cyber_unit', position: { q: 0, r: 0 } };
    state.units[targetId] = { ...state.units[targetId], position: { q: 1, r: 0 } };
    state.autonomyByCiv!.player.plans.swarm = {
      id: 'swarm', ownerCivId: 'player', definitionId: 'swarm-strike', source: { kind: 'unit', unitId: sourceId },
      target: { kind: 'formation', unitIds: [targetId] }, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkCombatCoordination(state, state.units[targetId], 'attack')).toEqual({ strengthBonus: 4, planId: 'swarm' });
    expect(getNetworkCombatCoordination(state, state.units[targetId], 'defense')).toEqual({ strengthBonus: 0, planId: null });
  });

  it('Hypersonic Coordination adds a bounded bonus only to ranged units in an active attack formation', () => {
    const state = createNewGame('rome', 'network-hypersonic', 'small');
    const [sourceId, targetId] = state.civilizations.player.units;
    state.civilizations.player.techState.completed = ['hypersonic-coordination'];
    state.units[sourceId] = { ...state.units[sourceId], type: 'drone_controller', position: { q: 0, r: 0 } };
    state.units[targetId] = { ...state.units[targetId], type: 'combat_drone', position: { q: 1, r: 0 } };
    state.autonomyByCiv!.player.plans.swarm = {
      id: 'swarm', ownerCivId: 'player', definitionId: 'swarm-strike', source: { kind: 'unit', unitId: sourceId },
      target: { kind: 'formation', unitIds: [targetId] }, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(getNetworkCombatCoordination(state, state.units[targetId], 'attack')).toEqual({ strengthBonus: 6, planId: 'swarm' });
    state.units[targetId] = { ...state.units[targetId], type: 'exosuit_infantry' };
    expect(getNetworkCombatCoordination(state, state.units[targetId], 'attack')).toEqual({ strengthBonus: 4, planId: 'swarm' });
  });
});
