import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, Unit } from '@/core/types';
import {
  assignNetworkPlan,
  holdNetworkPlan,
  isAutonomyActivated,
  previewNetworkPlan,
  cancelInvalidNetworkPlans,
  retargetNetworkPlan,
  resolveStableNetworkPlansForOwnerTurn,
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

function makeDroneController(id: string, owner: string, q: number): Unit {
  return { ...makeCyberUnit(id, owner, q), type: 'drone_controller' };
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
  it('emits one explicit stable resolution for an active constructive plan on its owner turn', () => {
    const state = makeState();
    state.cities['city-player']!.buildings = ['network_operations_center'];
    state.autonomyByCiv!.player.plans.mesh = {
      id: 'mesh', ownerCivId: 'player', definitionId: 'research-mesh',
      source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    const result = resolveStableNetworkPlansForOwnerTurn(state, 'player');

    expect(result.resolutions).toEqual([
      { civId: 'player', planId: 'mesh', definitionId: 'research-mesh', cityId: 'city-player', stable: true, turn: state.turn },
    ]);
  });

  it('does not emit stable resolutions during Surge or recovery', () => {
    const state = makeState();
    state.cities['city-player']!.buildings = ['space_center'];
    state.autonomyByCiv!.player.plans.survey = {
      id: 'survey', ownerCivId: 'player', definitionId: 'survey-grid',
      source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' },
      linkedUnitIds: ['unit-cyber'], status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
      surgeResolutionTurn: state.turn,
    };

    expect(resolveStableNetworkPlansForOwnerTurn(state, 'player').resolutions).toEqual([]);

    state.autonomyByCiv!.player.plans.survey.surgeResolutionTurn = null;
    state.autonomyByCiv!.player.surgeRecoveryUntilTurn = state.turn + 1;
    expect(resolveStableNetworkPlansForOwnerTurn(state, 'player').resolutions).toEqual([]);
  });

  it('emits a Survey Grid fact with its source city on an ordinary owner turn', () => {
    const state = makeState();
    state.cities['city-player']!.buildings = ['space_center'];
    state.autonomyByCiv!.player.plans.survey = {
      id: 'survey', ownerCivId: 'player', definitionId: 'survey-grid',
      source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' },
      linkedUnitIds: ['unit-cyber'], status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    expect(resolveStableNetworkPlansForOwnerTurn(state, 'player').resolutions).toEqual([
      { civId: 'player', planId: 'survey', definitionId: 'survey-grid', cityId: 'city-player', stable: true, turn: state.turn },
    ]);
  });

  it('cleans an invalid plan before it can emit a stable resolution', () => {
    const state = makeState();
    state.autonomyByCiv!.player.plans.mesh = {
      id: 'mesh', ownerCivId: 'player', definitionId: 'research-mesh',
      source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    const result = resolveStableNetworkPlansForOwnerTurn(state, 'player');

    expect(result.resolutions).toEqual([]);
    expect(result.state.autonomyByCiv!.player.plans).not.toHaveProperty('mesh');
  });

  it('emits the same owner-turn fact for an AI civilization', () => {
    const state = makeState();
    state.cities['city-ai']!.buildings = ['network_operations_center'];
    state.civilizations['ai-1']!.techState.completed = ['quantum-computing'];
    state.autonomyByCiv!['ai-1'].plans.mesh = {
      id: 'mesh', ownerCivId: 'ai-1', definitionId: 'research-mesh',
      source: { kind: 'city', cityId: 'city-ai' }, target: { kind: 'city', cityId: 'city-ai' },
      status: 'active', createdTurn: state.turn, nextResolutionTurn: state.turn, warnedTurn: null,
    };

    expect(resolveStableNetworkPlansForOwnerTurn(state, 'ai-1').resolutions).toEqual([
      { civId: 'ai-1', planId: 'mesh', definitionId: 'research-mesh', cityId: 'city-ai', stable: true, turn: state.turn },
    ]);
  });

  it('uses the Autonomous Mobility Survey Grid Load in both validation and preview', () => {
    const state = makeState();
    state.cities['city-player']!.buildings = ['network_operations_center'];
    state.units['unit-one'] = makeCyberUnit('unit-one', 'player', 0);
    state.units['unit-two'] = makeCyberUnit('unit-two', 'player', 0);
    state.civilizations.player.units = ['unit-cyber', 'unit-one', 'unit-two'];
    state.autonomyByCiv!.player.plans.existing = {
      id: 'existing', ownerCivId: 'player', definitionId: 'exploit', sourceUnitId: 'unit-cyber',
      target: { kind: 'city', cityId: 'city-ai' }, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null,
    };
    const request = {
      ownerCivId: 'player', source: { kind: 'city' as const, cityId: 'city-player' },
      definitionId: 'survey-grid' as const, target: { kind: 'city' as const, cityId: 'city-player' },
      linkedUnitIds: ['unit-one', 'unit-two'],
    };

    expect(previewNetworkPlan(state, request)).toMatchObject({ validation: { ok: false }, load: 3 });
    state.civilizations.player.techState.completed.push('autonomous-mobility');
    expect(previewNetworkPlan(state, request)).toMatchObject({ validation: { ok: true }, load: 2 });
  });

  it('lets Open Intelligence Commons assign its first constructive plan at zero Load', () => {
    const state = makeState();
    state.cities['city-player']!.buildings = ['network_operations_center'];
    state.completedLegendaryWonders = {
      'open-intelligence-commons': { ownerId: 'player', cityId: 'city-player', turnCompleted: state.turn },
    };
    const request = {
      ownerCivId: 'player', source: { kind: 'city' as const, cityId: 'city-player' },
      definitionId: 'research-mesh' as const, target: { kind: 'city' as const, cityId: 'city-player' },
    };

    expect(previewNetworkPlan(state, request)).toMatchObject({ validation: { ok: true }, load: 0 });
    const assigned = assignNetworkPlan(state, request);

    expect(assigned.plan?.effectState?.openIntelligenceCommonsFreeLoad).toBe(true);
    expect(previewNetworkPlan(assigned.state, request).load).toBe(3);
  });

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

  it('does not allow a new ordinary plan while the network is in Surge recovery', () => {
    const state = makeState();
    state.cities['city-player'].buildings = ['smart_grid'];
    state.autonomyByCiv!.player.surgeRecoveryUntilTurn = state.turn + 2;

    expect(validateNetworkPlanAssignment(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: 'city-player' },
      definitionId: 'fabrication-sprint', target: { kind: 'city', cityId: 'city-player' },
    })).toEqual({ ok: false, reason: 'network-recovering' });
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

  it('makes hostile plans cost one extra Load and delay one preparation round in Safeguarded posture', () => {
    const state = makeState();
    state.autonomyByCiv!.player.posture = 'safeguarded';
    const request = {
      ownerCivId: 'player', sourceUnitId: 'unit-cyber', definitionId: 'exploit' as const,
      target: { kind: 'city' as const, cityId: 'city-ai' },
    };

    expect(validateNetworkPlanAssignment(state, request)).toEqual({ ok: false, reason: 'ordinary-load-exceeds-capacity' });
    state.cities['city-player'].buildings = ['network_operations_center'];
    const assigned = assignNetworkPlan(state, request);
    expect(assigned.plan).toMatchObject({ status: 'preparing', nextResolutionTurn: state.turn + 1 });
  });

  it('limits Survey Grid to two linked friendly units', () => {
    const state = makeState();
    state.cities['city-player'].buildings = ['space_center'];
    state.units['unit-second'] = makeCyberUnit('unit-second', 'player', 1);
    state.units['unit-third'] = makeCyberUnit('unit-third', 'player', 1);
    state.civilizations.player.units.push('unit-second', 'unit-third');

    expect(validateNetworkPlanAssignment(state, {
      ownerCivId: 'player', source: { kind: 'city', cityId: 'city-player' }, definitionId: 'survey-grid',
      target: { kind: 'city', cityId: 'city-player' }, linkedUnitIds: ['unit-cyber', 'unit-second', 'unit-third'],
    })).toEqual({ ok: false, reason: 'invalid-target' });
  });

  it('allows formation plans only from a Drone Controller through the canonical validator', () => {
    const state = makeState();
    state.units.controller = makeDroneController('controller', 'player', 1);
    state.units.escort = { ...makeCyberUnit('escort', 'player', 2), type: 'exosuit_infantry' };
    state.civilizations.player.units.push('controller', 'escort');

    const controllerRequest = {
      ownerCivId: 'player', sourceUnitId: 'controller', definitionId: 'guardian-screen' as const,
      target: { kind: 'formation' as const, unitIds: ['escort'] },
    };
    const cyberRequest = { ...controllerRequest, sourceUnitId: 'unit-cyber' };

    expect(validateNetworkPlanAssignment(state, controllerRequest)).toEqual({ ok: true });
    expect(validateNetworkPlanAssignment(state, cyberRequest)).toEqual({ ok: false, reason: 'invalid-source' });
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

  it('does not cancel a stable plan merely because another plan is temporarily Surged', () => {
    const state = makeState();
    const secondCity = makeCity('city-player-2', 'player', 1);
    state.cities['city-player'].buildings = ['network_operations_center'];
    secondCity.buildings = ['smart_grid'];
    state.cities[secondCity.id] = secondCity;
    state.civilizations.player.cities.push(secondCity.id);
    state.autonomyByCiv!.player.plans = {
      surged: { id: 'surged', ownerCivId: 'player', definitionId: 'fabrication-sprint', source: { kind: 'city', cityId: 'city-player' }, target: { kind: 'city', cityId: 'city-player' }, surgeResolutionTurn: state.turn, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null },
      stable: { id: 'stable', ownerCivId: 'player', definitionId: 'fabrication-sprint', source: { kind: 'city', cityId: secondCity.id }, target: { kind: 'city', cityId: secondCity.id }, status: 'active', createdTurn: 1, nextResolutionTurn: 1, warnedTurn: null },
    };

    expect(cancelInvalidNetworkPlans(state).cancelled).toEqual([]);
  });
});
