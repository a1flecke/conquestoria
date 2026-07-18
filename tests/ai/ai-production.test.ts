import { describe, expect, it } from 'vitest';
import {
  applyAIProduction,
  economyValue,
  generateAIProductionCandidates,
} from '@/ai/ai-production';
import type {
  GameState,
  PersonalityTraits,
  ResourceType,
} from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { TECH_TREE, resolveCivilizationEra } from '@/systems/tech-definitions';
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
      resolveCivilizationEra(state.civilizations['ai-1'].techState.completed),
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

describe('happiness building AI scoring (#552)', () => {
  it('economyValue scores a temple higher than an otherwise-identical zero-happiness building', () => {
    // temple: yields { science: 1 }, happiness: 1 → economyValue = 1*1.25 + 1*1.5 = 2.75
    // shrine: yields { science: 1 }, no happiness → economyValue = 1*1.25 = 1.25
    // Testing economyValue directly (rather than full candidate .score) isolates
    // the happiness term: candidate-level score also factors in productionCost
    // (via productionTurns), and temple/shrine costs differ substantially (45 vs
    // 8), which would dominate the comparison and mask the happiness delta.
    expect(economyValue('temple')).toBeGreaterThan(economyValue('shrine'));
    expect(economyValue('temple') - economyValue('shrine')).toBe(1.5);
  });

  it('a temple appears as a production candidate once philosophy is researched', () => {
    const state = setupState(['philosophy']);
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const temple = candidates.find(c => c.itemId === 'temple');
    expect(temple).toBeDefined();
    expect(temple!.economyScore).toBe(economyValue('temple'));
  });
});

describe('#591 MR4 — milestone national project AI scoring', () => {
  it('economyValue treats a milestone NP as comparable to a normal same-era NP, not worthless', () => {
    // sacred_council has civYieldBonus: undefined (its effect is a one-time state
    // mutation, not a yield) -- without a milestone-specific floor, economyValue would
    // score it 0, deeply undercutting its 120-production-turn cost in the candidate
    // score formula (score = economyScore*2 - productionTurns*1.5 - ...) and making the
    // AI functionally never build it. Compare against philosophers_circle (era 3 NP,
    // civYieldBonus: { science: 3 } -> economyValue 3.75) as a same-era reference point.
    expect(economyValue('sacred_council')).toBeGreaterThan(0);
    expect(economyValue('sacred_council')).toBeGreaterThanOrEqual(economyValue('iron_legion'));
  });

  it('sacred_council scores comparably to a same-cost, same-era normal NP (not singled out as worthless)', () => {
    // Absolute score floors are meaningless here -- productionTurns dominates the
    // formula and swings hugely with this fixture's (low, unrealistic-for-era-3)
    // production rate. The real fairness check is RELATIVE: does sacred_council score
    // in the same ballpark as iron_legion, an equal-cost (120) era-3 NP, under the
    // identical city/production conditions -- proving the milestone floor actually
    // closed the gap, not just made the number less negative in isolation.
    const state = setupState(['philosophy', 'iron-forging']);
    state.era = 3;
    state.civilizations['ai-1'].techState.completed = TECH_TREE
      .filter(tech => tech.era <= 3 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    state.cities['city-a']!.buildings = ['temple'];
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const sacredCouncil = candidates.find(c => c.itemId === 'sacred_council');
    const ironLegion = candidates.find(c => c.itemId === 'iron_legion');
    expect(sacredCouncil).toBeDefined();
    expect(ironLegion).toBeDefined();
    expect(Math.abs(sacredCouncil!.score - ironLegion!.score)).toBeLessThan(5);
  });
});

describe('#592 MR5 — missionary production scoring', () => {
  function withFoundedReligion(state: GameState, cityId: string, boon?: 'serenity' | 'tithes' | 'fervor'): GameState {
    const religionId = 'religion-ai-1';
    state.religions = { [religionId]: { id: religionId, name: 'Test Faith', ownerCivId: 'ai-1', foundedTurn: 1, boon } };
    state.cityFaith = { [cityId]: { religionId } };
    state.cities[cityId]!.buildings = [...state.cities[cityId]!.buildings, 'temple'];
    return state;
  }

  it('missionary is NOT a candidate without a founded religion + own-faith Temple city', () => {
    const state = setupState(['philosophy']);
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    expect(candidates.find(c => c.itemId === 'missionary')).toBeUndefined();
  });

  it('missionary IS a candidate once religion + own faith + Temple all hold', () => {
    const state = withFoundedReligion(setupState(['philosophy']), 'city-a');
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    expect(candidates.find(c => c.itemId === 'missionary')).toBeDefined();
  });

  it('scores missionary higher for a civ with the Fervor boon than one without, all else equal', () => {
    const stateFervor = withFoundedReligion(setupState(['philosophy']), 'city-a', 'fervor');
    const stateNoBoon = withFoundedReligion(setupState(['philosophy']), 'city-a');
    const fervorScore = generateAIProductionCandidates(stateFervor, 'ai-1', 'city-a', [], aggressive)
      .find(c => c.itemId === 'missionary')?.score ?? -Infinity;
    const baseScore = generateAIProductionCandidates(stateNoBoon, 'ai-1', 'city-a', [], aggressive)
      .find(c => c.itemId === 'missionary')?.score ?? -Infinity;
    expect(fervorScore).toBeGreaterThan(baseScore);
  });
});
