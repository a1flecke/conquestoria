import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, Unit } from '@/core/types';
import {
  assignNetworkPlan,
  holdNetworkPlan,
  isAutonomyActivated,
  cancelInvalidNetworkPlans,
  retargetNetworkPlan,
  validateNetworkPlanAssignment,
} from '@/systems/network-plan-system';

function makeCity(id: string, owner: string, q: number): City {
  return {
    id,
    name: id,
    owner,
    position: { q, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 10,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'village',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    idleProduction: null,
  };
}

function makeCyberUnit(id: string, owner: string, q: number): Unit {
  return {
    id,
    type: 'cyber_unit',
    owner,
    position: { q, r: 0 },
    movementPointsLeft: 3,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

function makeState(): GameState {
  const state = createNewGame('rome', 'network-plan-system', 'small');
  const playerCity = makeCity('city-player', 'player', 0);
  const enemyCity = makeCity('city-ai', 'ai-1', 2);
  const cyberUnit = makeCyberUnit('unit-cyber', 'player', 1);
  state.cities = { [playerCity.id]: playerCity, [enemyCity.id]: enemyCity };
  state.units = { [cyberUnit.id]: cyberUnit };
  state.civilizations.player = {
    ...state.civilizations.player,
    cities: [playerCity.id],
    units: [cyberUnit.id],
    techState: { ...state.civilizations.player.techState, completed: ['quantum-computing'] },
    diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  state.civilizations['ai-1'] = {
    ...state.civilizations['ai-1'],
    cities: [enemyCity.id],
    units: [],
    diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  state.idCounters.nextNetworkPlanId = 1;
  return state;
}

describe('network plan lifecycle', () => {
  it('activates only after a civilization completes its first Era 13 technology', () => {
    const state = makeState();
    expect(isAutonomyActivated(state, 'player')).toBe(true);

    state.civilizations.player.techState.completed = ['cloud-computing'];
    expect(isAutonomyActivated(state, 'player')).toBe(false);
  });

  it('assigns Harden immutably with a stable plan ID', () => {
    const state = makeState();
    const result = assignNetworkPlan(state, {
      ownerCivId: 'player',
      sourceUnitId: 'unit-cyber',
      definitionId: 'harden',
      target: { kind: 'city', cityId: 'city-player' },
    });

    expect(result.validation).toEqual({ ok: true });
    expect(result.plan).toMatchObject({
      id: 'network-plan-1',
      definitionId: 'harden',
      status: 'active',
      sourceUnitId: 'unit-cyber',
    });
    expect(result.state.autonomyByCiv!.player.plans['network-plan-1']).toEqual(result.plan);
    expect(result.state.idCounters.nextNetworkPlanId).toBe(2);
    expect(state.autonomyByCiv!.player.plans).toEqual({});
    expect(state.idCounters.nextNetworkPlanId).toBe(1);
  });

  it('assigns Fabrication Sprint from an eligible owned city without a Cyber Unit', () => {
    const state = makeState();
    state.cities['city-player'].buildings = ['smart_grid'];

    const result = assignNetworkPlan(state, {
      ownerCivId: 'player',
      source: { kind: 'city', cityId: 'city-player' },
      definitionId: 'fabrication-sprint',
      target: { kind: 'city', cityId: 'city-player' },
    });

    expect(result.validation).toEqual({ ok: true });
    expect(result.plan).toMatchObject({
      definitionId: 'fabrication-sprint', source: { kind: 'city', cityId: 'city-player' }, status: 'active',
    });
  });

  it('rejects ordinary assignments that would exceed Capacity without canceling stable plans', () => {
    const state = makeState();
    const secondCity = makeCity('city-player-2', 'player', 1);
    state.cities['city-player'].buildings = ['smart_grid'];
    secondCity.buildings = ['smart_grid'];
    state.cities[secondCity.id] = secondCity;
    state.civilizations.player.cities.push(secondCity.id);
    state.autonomyByCiv!.player.plans.existing = {
      id: 'existing', ownerCivId: 'player', definitionId: 'fabrication-sprint',
      source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' },
      status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };

    expect(validateNetworkPlanAssignment(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: secondCity.id },
      definitionId: 'fabrication-sprint', target: { kind: 'city', cityId: secondCity.id },
    })).toEqual({ ok: false, reason: 'ordinary-load-exceeds-capacity' });
  });

  it('rejects Exploit without bilateral war and leaves state untouched', () => {
    const state = makeState();
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];
    const request = {
      ownerCivId: 'player',
      sourceUnitId: 'unit-cyber',
      definitionId: 'exploit' as const,
      target: { kind: 'city' as const, cityId: 'city-ai' },
    };

    expect(validateNetworkPlanAssignment(state, request)).toEqual({ ok: false, reason: 'target-not-at-war' });
    expect(assignNetworkPlan(state, request)).toMatchObject({ state, validation: { ok: false, reason: 'target-not-at-war' }, plan: null });
  });

  it('retargets an active Harden plan without allocating another ID', () => {
    const state = makeState();
    const secondCity = makeCity('city-player-2', 'player', 2);
    state.cities[secondCity.id] = secondCity;
    state.civilizations.player.cities.push(secondCity.id);
    const assigned = assignNetworkPlan(state, {
      ownerCivId: 'player',
      sourceUnitId: 'unit-cyber',
      definitionId: 'harden',
      target: { kind: 'city', cityId: 'city-player' },
    });

    const retargeted = retargetNetworkPlan(assigned.state, 'player', 'network-plan-1', {
      kind: 'city', cityId: 'city-player-2',
    });

    expect(retargeted.validation).toEqual({ ok: true });
    expect(retargeted.plan).toMatchObject({ id: 'network-plan-1', target: { kind: 'city', cityId: 'city-player-2' } });
    expect(retargeted.state.idCounters.nextNetworkPlanId).toBe(2);
  });

  it('keeps an active constructive plan active after a valid retarget', () => {
    const state = makeState();
    const secondCity = makeCity('city-player-2', 'player', 1);
    state.cities['city-player'].buildings = ['smart_grid'];
    secondCity.buildings = ['smart_grid'];
    state.cities[secondCity.id] = secondCity;
    state.civilizations.player.cities.push(secondCity.id);
    const assigned = assignNetworkPlan(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: 'city-player' },
      definitionId: 'fabrication-sprint', target: { kind: 'city', cityId: 'city-player' },
    });

    expect(retargetNetworkPlan(assigned.state, 'player', 'network-plan-1', { kind: 'city', cityId: secondCity.id }).plan)
      .toMatchObject({ status: 'active', target: { kind: 'city', cityId: secondCity.id } });
  });

  it('puts a Cyber Unit on Hold by removing its current plan', () => {
    const assigned = assignNetworkPlan(makeState(), {
      ownerCivId: 'player',
      sourceUnitId: 'unit-cyber',
      definitionId: 'harden',
      target: { kind: 'city', cityId: 'city-player' },
    });

    const held = holdNetworkPlan(assigned.state, 'player', 'unit-cyber');

    expect(held.validation).toEqual({ ok: true });
    expect(held.plan).toBeNull();
    expect(held.state.autonomyByCiv!.player.plans).toEqual({});
    expect(held.state.idCounters.nextNetworkPlanId).toBe(2);
  });

  it('cancels an Exploit immediately when its source leaves range', () => {
    const assigned = assignNetworkPlan(makeState(), {
      ownerCivId: 'player',
      sourceUnitId: 'unit-cyber',
      definitionId: 'exploit',
      target: { kind: 'city', cityId: 'city-ai' },
    });
    assigned.state.units['unit-cyber'] = { ...assigned.state.units['unit-cyber'], position: { q: 5, r: 0 } };

    const cleaned = cancelInvalidNetworkPlans(assigned.state);

    expect(cleaned.state.autonomyByCiv!.player.plans).toEqual({});
    expect(cleaned.cancelled).toEqual([{ planId: 'network-plan-1', reason: 'target-out-of-range' }]);
  });

  it('keeps a valid city-sourced plan through lifecycle cleanup', () => {
    const state = makeState();
    state.cities['city-player'].buildings = ['smart_grid'];
    const assigned = assignNetworkPlan(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: 'city-player' },
      definitionId: 'fabrication-sprint', target: { kind: 'city', cityId: 'city-player' },
    });

    expect(cancelInvalidNetworkPlans(assigned.state)).toMatchObject({ cancelled: [] });
    expect(cancelInvalidNetworkPlans(assigned.state).state.autonomyByCiv!.player.plans).toHaveProperty('network-plan-1');
  });

  it('cancels Survey Grid when a linked unit is no longer a valid friendly recipient', () => {
    const state = makeState();
    state.cities['city-player'].buildings = ['space_center'];
    const assigned = assignNetworkPlan(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: 'city-player' }, definitionId: 'survey-grid',
      target: { kind: 'city', cityId: 'city-player' }, linkedUnitIds: ['unit-cyber'],
    });
    delete assigned.state.units['unit-cyber'];

    expect(cancelInvalidNetworkPlans(assigned.state).cancelled).toEqual([{ planId: 'network-plan-1', reason: 'invalid-target' }]);
  });
});
