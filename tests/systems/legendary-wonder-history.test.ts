import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  appendLegendaryWonderMilitaryFacts,
  appendLegendaryWonderNetworkPlanResolutions,
  getCurrentCombatRoleFielding,
  getLegendaryWonderMilitaryQuestProgress,
} from '@/systems/legendary-wonder-history';

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

  it('appends each supplied military fact once without reconstructing history', () => {
    const state = createNewGame('rome', 'wonder-military-history', 'small');
    const fact = {
      id: 'combat-win:1:warrior:raider:warrior',
      kind: 'surviving-combat-win' as const,
      civId: 'player',
      unitId: 'warrior',
      role: 'frontline' as const,
      turn: state.turn,
    };

    const recorded = appendLegendaryWonderMilitaryFacts(state, [fact, fact]);
    expect(recorded.legendaryWonderHistory?.militaryFacts).toEqual([fact]);
    expect(appendLegendaryWonderMilitaryFacts(recorded, [fact])).toEqual(recorded);
  });

  it('counts only the owner’s active, on-map combat roles for simultaneous fielding', () => {
    const state = createNewGame('rome', 'wonder-role-fielding', 'small');
    state.units = {
      frontline: { id: 'frontline', type: 'warrior', owner: 'player', position: { q: 1, r: 1 }, health: 100 },
      ranged: { id: 'ranged', type: 'archer', owner: 'player', position: { q: 2, r: 1 }, health: 100 },
      transported: { id: 'transported', type: 'catapult', owner: 'player', position: { q: 3, r: 1 }, health: 100, transportId: 'ship' },
      rival: { id: 'rival', type: 'horseman', owner: 'rival', position: { q: 4, r: 1 }, health: 100 },
      civilian: { id: 'civilian', type: 'worker', owner: 'player', position: { q: 5, r: 1 }, health: 100 },
    } as any;

    expect(getCurrentCombatRoleFielding(state, 'player')).toEqual({ frontline: 1, ranged: 1 });
  });

  it('reports exact fielding progress from a typed military quest requirement', () => {
    const state = createNewGame('rome', 'wonder-role-progress', 'small');
    state.units = {
      frontline: { id: 'frontline', type: 'warrior', owner: 'player', position: { q: 1, r: 1 }, health: 100 },
      ranged: { id: 'ranged', type: 'archer', owner: 'player', position: { q: 2, r: 1 }, health: 100 },
    } as any;

    expect(getLegendaryWonderMilitaryQuestProgress(state, 'player', {
      id: 'roles',
      type: 'field-combat-roles',
      targetUnitCount: 4,
      targetRoleCount: 3,
    })).toEqual({ current: 2, target: 4, secondaryCurrent: 2, secondaryTarget: 3 });
  });
});
