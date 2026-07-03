import { describe, expect, it } from 'vitest';
import {
  applyAIProduction,
  generateAIProductionCandidates,
} from '@/ai/ai-production';
import type {
  GameState,
  PersonalityTraits,
  ResourceType,
} from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { TECH_TREE } from '@/systems/tech-definitions';
import {
  BUILDINGS,
  TRAINABLE_UNITS,
  foundCity,
  getAvailableBuildings,
  getTrainableUnitsForCity,
} from '@/systems/city-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import type { AIForceDemand } from '@/ai/ai-unit-assignment';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';

const aggressive: PersonalityTraits = {
  traits: ['aggressive'],
  warLikelihood: 1,
  diplomacyFocus: 0,
  expansionDrive: 0,
};

const expansionist: PersonalityTraits = {
  traits: ['expansionist'],
  warLikelihood: 0,
  diplomacyFocus: 0,
  expansionDrive: 1,
};

function demand(
  role: AIForceDemand['role'],
  missing = 1,
  priority = 100,
  sourcePlanIds = ['primary'],
): AIForceDemand {
  return {
    role,
    desired: missing,
    assigned: 0,
    missing,
    priority,
    sourcePlanIds,
  };
}

function setupState(
  completed: string[] = [],
  cityIds = ['city-a'],
): GameState {
  const state = createNewGame(undefined, `ai-production-${cityIds.join('-')}`, 'small');
  const civ = state.civilizations['ai-1'];
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  civ.cities = [];
  for (const [index, cityId] of cityIds.entries()) {
    const city = foundCity(
      civ.id,
      index === 0
        ? settler.position
        : { q: settler.position.q + index * 3, r: settler.position.r },
      state.map,
      state.idCounters,
    );
    city.id = cityId;
    city.population = 4;
    city.productionQueue = [];
    state.cities[cityId] = city;
    civ.cities.push(cityId);
    for (const coord of [city.position, ...hexNeighbors(city.position)]) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile && (tile.terrain === 'coast' || tile.terrain === 'ocean')) {
        tile.terrain = 'plains';
      }
    }
  }
  civ.techState.completed = [...completed];
  civ.gold = 500;
  return state;
}

function grantResources(state: GameState, resources: ResourceType[]): void {
  state.marketplace!.purchasedResources = resources.map(resource => ({
    civId: 'ai-1',
    resource,
    expiresOnTurn: state.turn + 10,
  }));
}

function makeCoastal(state: GameState, cityId = 'city-a'): void {
  const city = state.cities[cityId];
  const neighbor = hexNeighbors(city.position)[0];
  const key = hexKey(neighbor);
  if (state.map.tiles[key]) state.map.tiles[key].terrain = 'coast';
}

describe('AI strategic production', () => {
  it('selects an eligible catapult for missing siege demand', () => {
    const state = setupState(['gathering', 'siege-warfare']);
    grantResources(state, ['stone']);

    const result = applyAIProduction(state, 'ai-1', [demand('siege')], aggressive);

    expect(result.cities['city-a'].productionQueue).toEqual(['catapult']);
  });

  it('preserves a non-empty city queue byte-for-byte', () => {
    const state = setupState(['gathering', 'siege-warfare']);
    grantResources(state, ['stone']);
    state.cities['city-a'].productionQueue = ['library', 'warrior'];
    const before = structuredClone(state.cities['city-a'].productionQueue);

    const result = applyAIProduction(state, 'ai-1', [demand('siege')], aggressive);

    expect(result.cities['city-a'].productionQueue).toEqual(before);
  });

  it('fills one missing siege slot only once across two idle cities', () => {
    const state = setupState(['gathering', 'siege-warfare'], ['city-a', 'city-b']);
    grantResources(state, ['stone']);

    const result = applyAIProduction(state, 'ai-1', [demand('siege')], aggressive);

    const queuedSiege = Object.values(result.cities)
      .flatMap(city => city.productionQueue)
      .filter(item =>
        TRAINABLE_UNITS.some(unit => unit.type === item)
        && getAIStrategicRoles(item as never).includes('siege'));
    expect(queuedSiege).toHaveLength(1);
  });

  it('excludes resource-blocked and non-coastal naval candidates', () => {
    const state = setupState(['siege-warfare', 'galleys']);

    const candidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('siege'), demand('naval-combat')],
      aggressive,
    );

    expect(candidates.map(candidate => candidate.itemId)).not.toContain('catapult');
    expect(candidates.map(candidate => candidate.itemId)).not.toContain('galley');
  });

  it('restricts critical and high strain to emergency defense or recovery', () => {
    const state = setupState(['gathering', 'siege-warfare']);
    grantResources(state, ['stone']);
    state.economyStatusByCiv = {
      'ai-1': {
        turn: state.turn,
        grossGoldIncome: 0,
        buildingMaintenance: 5,
        unitMaintenance: 5,
        netGoldPerTurn: -10,
        unpaidMaintenance: 10,
        strainLevel: 'critical',
      },
    };

    const offensive = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('siege')],
      aggressive,
    );
    const emergency = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('frontline', 1, 700, ['defense-overflow:city-a'])],
      aggressive,
    );

    expect(offensive.some(candidate => candidate.roles.includes('siege'))).toBe(false);
    expect(emergency.some(candidate => candidate.roles.includes('frontline'))).toBe(true);
  });

  it('lets emergency city defense outrank a slower offensive preference', () => {
    const state = setupState(['gathering', 'siege-warfare']);
    grantResources(state, ['stone']);

    const result = applyAIProduction(state, 'ai-1', [
      demand('siege', 1, 200),
      demand('frontline', 1, 700, ['defense-overflow:city-a']),
    ], aggressive);

    expect(result.cities['city-a'].productionQueue[0]).toBe('warrior');
  });

  it('requires cargo demand for transport and keeps transport pairing coherent', () => {
    const state = setupState(['galleys']);
    makeCoastal(state);

    const transportOnly = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport')],
      expansionist,
    );
    const paired = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('transport'), demand('capture')],
      expansionist,
    );

    expect(transportOnly.map(candidate => candidate.itemId)).not.toContain('transport');
    expect(paired.map(candidate => candidate.itemId)).toContain('transport');
  });

  it('classifies carrier as naval combat and escort rather than transport', () => {
    expect(getAIStrategicRoles('carrier')).toEqual(['naval-combat', 'escort']);
  });

  it('uses city production ETA in candidate ranking', () => {
    const state = setupState([], ['city-a', 'city-b']);
    state.cities['city-b'].buildings = ['workshop'];

    const slow = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('frontline')],
      aggressive,
    ).find(candidate => candidate.itemId === 'warrior')!;
    const fast = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-b',
      [demand('frontline')],
      aggressive,
    ).find(candidate => candidate.itemId === 'warrior')!;

    expect(fast.productionTurns).toBeLessThan(slow.productionTurns);
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('does not duplicate unique recon or detection support without visible demand', () => {
    const state = setupState(['balloon-corps', 'lookouts']);
    state.cities['city-a'].productionQueue = ['observation_balloon'];

    const candidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('recon')],
      aggressive,
    );

    expect(candidates.map(candidate => candidate.itemId)).not.toContain('observation_balloon');
    expect(candidates.map(candidate => candidate.itemId)).not.toContain('scout_hound');
  });

  it('counts valid queued units as forecast role supply', () => {
    const state = setupState(['gathering', 'siege-warfare'], ['city-a', 'city-b']);
    grantResources(state, ['stone']);
    state.cities['city-a'].productionQueue = ['catapult'];

    const result = applyAIProduction(state, 'ai-1', [demand('siege')], aggressive);

    expect(result.cities['city-a'].productionQueue).toEqual(['catapult']);
    expect(result.cities['city-b'].productionQueue).not.toContain('catapult');
  });

  it('generates every currently trainable catalog unit including era-12 units', () => {
    const state = setupState(TECH_TREE.map(tech => tech.id));
    makeCoastal(state);
    state.cities['city-a'].buildings.push('stealth_airbase');
    grantResources(
      state,
      RESOURCE_DEFINITIONS.map(definition => definition.id as ResourceType),
    );

    const candidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [
        demand('frontline', 99),
        demand('ranged', 99),
        demand('siege', 99),
        demand('mobile', 99),
        demand('air-combat', 99),
        demand('naval-combat', 99),
        demand('transport', 99),
        demand('escort', 99),
        demand('recon', 99),
        demand('detection', 99),
        demand('settlement', 99),
        demand('worker', 99),
        demand('resource-expedition', 99),
        demand('trade', 99),
        demand('espionage', 99),
        demand('capture', 99),
      ],
      aggressive,
    );
    const generated = new Set(candidates.filter(candidate => candidate.kind === 'unit').map(candidate => candidate.itemId));

    const currentlyTrainable = getTrainableUnitsForCity(
      state.cities['city-a'],
      state.civilizations['ai-1'].techState.completed,
      state.map,
      state.civilizations['ai-1'].civType,
      new Set(RESOURCE_DEFINITIONS.map(definition => definition.id as ResourceType)),
    );
    for (const unit of currentlyTrainable) {
      expect(generated, unit.type).toContain(unit.type);
    }
    expect(TRAINABLE_UNITS.map(unit => unit.type)).toContain('cyber_unit');
    expect(TRAINABLE_UNITS.map(unit => unit.type)).toContain('stealth_bomber');
    expect(generated).toContain('cyber_unit');
    expect(generated).toContain('stealth_bomber');
  });

  it('generates every currently available building without hardcoded AI branches', () => {
    const state = setupState(TECH_TREE.map(tech => tech.id));
    state.era = 11;
    makeCoastal(state);
    grantResources(
      state,
      RESOURCE_DEFINITIONS.map(definition => definition.id as ResourceType),
    );

    const candidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [],
      aggressive,
    );
    const generated = new Set(
      candidates
        .filter(candidate => candidate.kind === 'building')
        .map(candidate => candidate.itemId),
    );
    const available = getAvailableBuildings(
      state.cities['city-a'],
      state.civilizations['ai-1'].techState.completed,
      state.map,
      new Set(RESOURCE_DEFINITIONS.map(definition => definition.id as ResourceType)),
      state.era,
      new Set(),
      'ai-1',
    );

    for (const building of available) {
      expect(generated, building.id).toContain(building.id);
    }
  });

  it('counts empire-wide national-project yields in economy scoring', () => {
    const state = setupState(['gathering']);
    state.era = 1;
    const candidate = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [],
      aggressive,
    ).find(entry => entry.itemId === 'communal_stores');

    expect(candidate?.economyScore).toBeGreaterThan(0);
  });

  it('never queues one empire-unique national project in multiple cities', () => {
    const state = setupState(['gathering'], ['city-a', 'city-b']);
    state.era = 1;
    const allOtherBuildings = Object.keys(BUILDINGS)
      .filter(buildingId => buildingId !== 'communal_stores');
    state.cities['city-a'].buildings = [...allOtherBuildings];
    state.cities['city-b'].buildings = [...allOtherBuildings];

    const result = applyAIProduction(state, 'ai-1', [], aggressive);
    const queued = ['city-a', 'city-b']
      .flatMap(cityId => result.cities[cityId].productionQueue)
      .filter(itemId => itemId === 'communal_stores');

    expect(queued).toHaveLength(1);
  });

  it('fills missing capture capacity before pure siege even at lower priority', () => {
    const state = setupState(['gathering', 'siege-warfare']);
    grantResources(state, ['stone']);
    state.units = {};
    state.civilizations['ai-1'].units = [];

    const result = applyAIProduction(state, 'ai-1', [
      demand('siege', 1, 900),
      demand('capture', 1, 100),
    ], aggressive);

    expect(result.cities['city-a'].productionQueue[0]).toBe('warrior');
  });

  it('lets personality affect a real tie and uses stable IDs for equal scores', () => {
    const state = setupState([]);

    const aggressiveCandidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('frontline'), demand('settlement')],
      aggressive,
    );
    const expansionCandidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [demand('frontline'), demand('settlement')],
      expansionist,
    );

    expect(aggressiveCandidates[0].itemId).toBe('warrior');
    expect(expansionCandidates[0].itemId).toBe('settler');
    const equal = aggressiveCandidates
      .filter(candidate => candidate.itemId === 'settler' || candidate.itemId === 'warrior')
      .map(candidate => ({ ...candidate, score: 10 }))
      .sort((left, right) => right.score - left.score || left.itemId.localeCompare(right.itemId));
    expect(equal.map(candidate => candidate.itemId)).toEqual(['settler', 'warrior']);
  });
});
