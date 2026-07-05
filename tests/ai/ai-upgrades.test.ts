import { describe, expect, it } from 'vitest';
import {
  processAIUpgrades,
} from '@/ai/ai-upgrades';
import { prepareMajorCivStrategicPlan } from '@/ai/ai-prepared-turn';
import { createNewGame } from '@/core/game-state';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { EventBus } from '@/core/event-bus';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

const AI = 'ai-1';

function setup(challenge: 'explorer' | 'standard' | 'veteran' = 'veteran') {
  const state = createNewGame({
    civType: 'rome',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'AI upgrades',
    seed: `ai-upgrades-${challenge}`,
    opponentChallenge: challenge,
  });
  state.turn = 20;
  state.opponentChallenge = challenge;
  const civ = state.civilizations[AI];
  state.units = {};
  state.cities = {};
  civ.units = [];
  civ.cities = [];
  civ.gold = 500;
  civ.techState.completed = ['espionage-scouting', 'espionage-informants'];
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'grassland';
    tile.owner = null;
  }
  const portfolio = createEmptyMajorCivPlanPortfolio();
  state.opponentAI!.majorCivs[AI] = portfolio;
  return state;
}

function addCity(state: GameState, id: string, position: HexCoord) {
  const city = foundCity(AI, position, state.map, state.idCounters);
  city.id = id;
  state.cities[id] = city;
  state.civilizations[AI].cities.push(id);
  state.map.tiles[hexKey(position)].owner = AI;
  return city;
}

function addObsolete(
  state: GameState,
  id: string,
  position: HexCoord,
  overrides: Partial<ReturnType<typeof createUnit>> = {},
) {
  const unit = {
    ...createUnit('spy_scout', AI, position, state.idCounters),
    id,
    experience: 30,
    ...overrides,
  };
  state.units[id] = unit;
  state.civilizations[AI].units.push(id);
  return unit;
}

function prepared(state: GameState) {
  const value = prepareMajorCivStrategicPlan(state, AI);
  value.portfolio = state.opponentAI!.majorCivs[AI];
  value.assignments.portfolio = value.portfolio;
  return value;
}

describe('AI modernization', () => {
  it('upgrades an obsolete veteran in a safe friendly city', () => {
    const state = setup();
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    addObsolete(state, 'veteran', city.position);
    const before = structuredClone(state);

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(state).toEqual(before);
    expect(result.upgradedUnitIds).toEqual(['veteran']);
    expect(result.state.units.veteran).toMatchObject({
      type: 'spy_informant',
      health: 100,
      hasActed: true,
    });
    expect(result.state.civilizations[AI].gold).toBe(475);
  });

  it('does not spend the emergency treasury reserve', () => {
    const state = setup();
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    addObsolete(state, 'veteran', city.position);
    state.civilizations[AI].gold = 25;

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.upgradedUnitIds).toEqual([]);
    expect(result.state.civilizations[AI].gold).toBe(25);
  });

  it('routes to the nearest safe reachable city with stable ID tie-breaking', () => {
    const state = setup();
    addCity(state, 'city-b', { q: 2, r: 0 });
    addCity(state, 'city-a', { q: 0, r: 2 });
    addObsolete(state, 'traveler', { q: 0, r: 0 });

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.traveler.cityId)
      .toBe('city-a');
    expect(result.state.units.traveler.position).not.toEqual({ q: 0, r: 0 });
    expect(result.state.units.traveler.position).not.toEqual({ q: 0, r: 2 });
  });

  it('retains a valid persisted route without oscillating destinations', () => {
    const state = setup();
    addCity(state, 'city-a', { q: 0, r: 2 });
    addCity(state, 'city-b', { q: 2, r: 0 });
    addObsolete(state, 'traveler', { q: 0, r: 0 });
    state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.traveler = {
      cityId: 'city-b',
      createdTurn: 18,
    };

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.traveler)
      .toEqual({ cityId: 'city-b', createdTurn: 18 });
  });

  it('does not route when the destination is threatened, unreachable, too far, or the unit is plan-assigned', () => {
    const state = setup();
    addCity(state, 'far-city', { q: 15, r: 0 });
    addObsolete(state, 'traveler', { q: 0, r: 0 });
    const plan = prepared(state);
    plan.assignments.assignmentsByPlanId = { active: ['traveler'] };

    const result = processAIUpgrades(state, AI, plan, new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId)
      .toEqual({});
  });

  it('does not create a route through an illegal path', () => {
    const state = setup();
    addCity(state, 'safe-city', { q: 3, r: 0 });
    addObsolete(state, 'traveler', { q: 0, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      if (key !== hexKey({ q: 0, r: 0 }) && key !== hexKey({ q: 3, r: 0 })) {
        delete state.map.tiles[key];
      }
    }

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId)
      .toEqual({});
  });

  it('does not upgrade jet_fighter to stealth_bomber in a city without stealth_airbase', () => {
    const state = setup();
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    state.civilizations[AI].techState.completed.push('jet-aviation', 'stealth-technology');
    addObsolete(state, 'flyer', city.position, { type: 'jet_fighter' as UnitType });

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.upgradedUnitIds).toEqual([]);
    expect(result.state.units.flyer.type).toBe('jet_fighter');
  });

  it('does not route a jet_fighter toward a safe city that lacks stealth_airbase', () => {
    const state = setup();
    addCity(state, 'no-airbase-city', { q: 2, r: 0 });
    state.civilizations[AI].techState.completed.push('jet-aviation', 'stealth-technology');
    addObsolete(state, 'flyer', { q: 0, r: 0 }, { type: 'jet_fighter' as UnitType });

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId).toEqual({});
    expect(result.routedUnitIds).toEqual([]);
  });

  it('routes a jet_fighter toward a safe city that has stealth_airbase', () => {
    const state = setup();
    const city = addCity(state, 'airbase-city', { q: 2, r: 0 });
    city.buildings = [...city.buildings, 'stealth_airbase'];
    state.civilizations[AI].techState.completed.push('jet-aviation', 'stealth-technology');
    addObsolete(state, 'flyer', { q: 0, r: 0 }, { type: 'jet_fighter' as UnitType });

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.flyer?.cityId)
      .toBe('airbase-city');
  });

  it('upgrades jet_fighter to stealth_bomber once the city has stealth_airbase', () => {
    const state = setup();
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    city.buildings = [...city.buildings, 'stealth_airbase'];
    state.civilizations[AI].techState.completed.push('jet-aviation', 'stealth-technology');
    addObsolete(state, 'flyer', city.position, { type: 'jet_fighter' as UnitType });

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.upgradedUnitIds).toEqual(['flyer']);
    expect(result.state.units.flyer.type).toBe('stealth_bomber');
  });

  it('clears a route after arrival and successful upgrade', () => {
    const state = setup();
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    addObsolete(state, 'traveler', city.position);
    state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.traveler = {
      cityId: city.id,
      createdTurn: 18,
    };

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.upgradedUnitIds).toContain('traveler');
    expect(result.state.opponentAI!.majorCivs[AI].upgradeRoutesByUnitId.traveler)
      .toBeUndefined();
  });

  it.each([
    ['explorer', 1],
    ['standard', 2],
    ['veteran', 3],
  ] as const)('caps %s upgrades at %i per round', (challenge, cap) => {
    const state = setup(challenge);
    const city = addCity(state, 'safe-city', { q: 0, r: 0 });
    for (let index = 0; index < 4; index++) {
      addObsolete(state, `unit-${index}`, city.position);
    }

    const result = processAIUpgrades(state, AI, prepared(state), new EventBus());

    expect(result.upgradedUnitIds).toHaveLength(cap);
  });
});
