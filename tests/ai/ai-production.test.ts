import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { computeUnrestPressure } from '@/systems/faction-system';
import type { AIForceDemand } from '@/ai/ai-unit-assignment';
import { getAIStrategicRoles } from '@/ai/ai-unit-roles';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { createEspionageCivState } from '@/systems/espionage-system';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { getStrategicArsenal, getStrategicArsenalCapacity, hasManhattanProject } from '@/systems/strategic-arsenal-system';
import { getCapitalCityId } from '@/systems/capital-system';

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

describe('strategicArsenalValueScore (#545)', () => {
  it('scores warhead 0 with no strategic arsenal signal at peace, positive once at war', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);

    const atPeace = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    expect(atPeace.strategicArsenalValueScore).toBe(0);

    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    const atWar = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    expect(atWar.strategicArsenalValueScore).toBeGreaterThan(0);
    expect(atWar.score).toBeGreaterThan(atPeace.score);
  });

  it('bounds strategicArsenalValueScore at 3 simultaneous wars', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'civ-c', 'civ-d'];

    const atThreeWars = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;

    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'civ-c', 'civ-d', 'civ-e', 'civ-f'];
    const atFiveWars = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;

    expect(atFiveWars.strategicArsenalValueScore).toBe(atThreeWars.strategicArsenalValueScore);
  });

  it('is 0 for a building with no arsenalCapacityGated capability, even at war', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    const nuclearArsenal = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'nuclear_arsenal')!;
    expect(nuclearArsenal.strategicArsenalValueScore).toBe(0);
  });

  it('nets a positive total score for warhead when at war, unlike the reliably-negative score it would get with no signal', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    // A believable era-10/11 production city, not this fixture's bare freshly-founded
    // default (near-zero yields) -- matches the ~22/turn baseline
    // era-pacing-profiles.ts calibrates marquee-band items like warhead against.
    state.cities['city-a']!.buildings.push('nuclear_arsenal', 'workshop');

    const warhead = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    expect(warhead.score).toBeGreaterThan(0);
  });

  it('warhead appears among AI building candidates once eligible, scored by the generic pipeline', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(true);

    state.civilizations['ai-1']!.techState.completed = [];
    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(false);
  });

  it('warhead drops out of AI building candidates once an arms-control pact caps the arsenal, even with physical capacity remaining (#545 MR6)', () => {
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    // Give physical capacity real headroom (base 1 + nuclear_arsenal 2 = 3) so
    // this genuinely proves the treaty cap (1) is the binding constraint --
    // without this, physical capacity alone (base 1) would already equal
    // strategicArsenal (1) and the test would pass for the wrong reason.
    state.cities['city-a']!.buildings.push('nuclear_arsenal');
    state.civilizations['ai-1']!.strategicArsenal = 1;
    state.civilizations['ai-1']!.diplomacy.treaties = [
      { type: 'arms_control_pact', civA: 'ai-1', civB: 'ai-2', turnsRemaining: -1, arsenalCap: 1 },
    ];

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(false);
  });

  it('ai-production.ts building-scoring loop has no warhead-id branch', () => {
    const source = readFileSync(resolve(__dirname, '../../src/ai/ai-production.ts'), 'utf-8');
    expect(source).not.toMatch(/buildingId\s*===\s*['"]warhead['"]/);
    expect(source).not.toMatch(/\.id\s*===\s*['"]warhead['"]/);
  });

  it('warhead never reaches strategicArsenalValueScore when superweapons is off (#545 MR7) -- confirms Task 3\'s getArsenalStatus gate alone is sufficient here', () => {
    // arsenalCapacityGated is set on warhead ONLY (verified directly against
    // BUILDINGS in city-system.ts -- nuclear_arsenal/missile_silo do not
    // carry it, contrary to an earlier design-review assumption). Since
    // getArsenalStatus (Task 3) already forces atCapacity: true when off,
    // getAvailableBuildings excludes warhead before this file's scoring loop
    // ever computes strategicArsenalValueScore for it -- there is no
    // reachable path left for a phantom AI incentive to leak through, so no
    // separate gate was added to strategicArsenalValueScore itself.
    const state = setupState(['nuclear-weapons', 'nuclear-physics']);
    grantResources(state, ['uranium']);
    state.settings.superweapons = 'off';
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'ai-2', 'ai-3'];
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };

    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    expect(candidates.find(c => c.itemId === 'warhead')).toBeUndefined();
  });
});

describe('AI strategic production', () => {
  it('generates SAM Site only from the AI city with both research and local prerequisites', () => {
    const state = setupState(['radar-systems', 'rocketry']);
    state.cities['city-a']!.buildings = ['anti_air_battery', 'radar_station'];

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'sam_site')).toBe(true);

    state.civilizations['ai-1']!.techState.completed = ['radar-systems'];
    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'sam_site')).toBe(false);
  });

  it.each(['explorer', 'standard', 'veteran'] as const)('keeps SAM Site legality identical for AI %s difficulty', difficulty => {
    const state = setupState(['radar-systems', 'rocketry']);
    state.opponentChallenge = difficulty;
    state.cities['city-a']!.buildings = ['anti_air_battery', 'radar_station'];

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'sam_site')).toBe(true);
  });

  it('does not let an AI use a rival city\'s hidden SAM prerequisites', () => {
    const state = setupState(['radar-systems', 'rocketry'], ['city-a', 'rival-city']);
    state.cities['rival-city'] = {
      ...state.cities['rival-city']!,
      owner: 'player',
      buildings: ['anti_air_battery', 'radar_station'],
    };
    state.civilizations.player.cities = ['rival-city'];

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'sam_site')).toBe(false);
  });

  it('scores typed air defense only against a visible hostile strike threat that can reach the city', () => {
    const state = setupState(['radar-systems', 'rocketry']);
    const city = state.cities['city-a']!;
    city.buildings = ['anti_air_battery', 'radar_station'];
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    const bomber = createUnit('bomber', 'player', city.position, state.idCounters);
    bomber.id = 'visible-hostile-bomber';
    state.units[bomber.id] = bomber;
    state.civilizations.player.units.push(bomber.id);
    state.civilizations['ai-1']!.visibility.tiles[hexKey(bomber.position)] = 'visible';

    const visibleThreat = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'sam_site')!;
    expect(visibleThreat.airDefenseThreatScore).toBe(120);

    state.civilizations['ai-1']!.visibility.tiles[hexKey(bomber.position)] = 'fog';
    const hiddenThreat = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'sam_site')!;
    expect(hiddenThreat.airDefenseThreatScore).toBe(0);
    expect(visibleThreat.score).toBeGreaterThan(hiddenThreat.score);
  });

  it('boosts destroyer production score when a hostile submarine has been sighted (remembered) (#542)', () => {
    const state = setupState(['carrier-warfare']);
    makeCoastal(state);
    const observed = { q: 8, r: 4 };
    state.civilizations['ai-1']!.knownCivilizations = ['player'];
    state.civilizations['ai-1']!.visibility.tiles[hexKey(observed)] = 'fog';
    const tile = state.map.tiles[hexKey(observed)];
    state.civilizations['ai-1']!.visibility.lastSeen = {
      [hexKey(observed)]: {
        coord: { ...observed },
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource: tile.resource,
        improvement: tile.improvement,
        improvementTurnsLeft: tile.improvementTurnsLeft,
        owner: tile.owner,
        hasRiver: tile.hasRiver,
        wonder: tile.wonder,
        observedTurn: state.turn,
        source: 'observed',
        units: [{ id: 'rival-sub', type: 'submarine', owner: 'player', healthBand: 'healthy' }],
      },
    };

    const withThreat = generateAIProductionCandidates(state, 'ai-1', 'city-a', [demand('escort')], aggressive);
    const destroyerWithThreat = withThreat.find(candidate => candidate.itemId === 'destroyer')!;
    expect(destroyerWithThreat.submarineThreatScore).toBeGreaterThan(0);

    const withoutThreatState = { ...state, civilizations: { ...state.civilizations, 'ai-1': { ...state.civilizations['ai-1']!, visibility: { ...state.civilizations['ai-1']!.visibility, lastSeen: {} } } } };
    const withoutThreat = generateAIProductionCandidates(withoutThreatState, 'ai-1', 'city-a', [demand('escort')], aggressive);
    const destroyerWithoutThreat = withoutThreat.find(candidate => candidate.itemId === 'destroyer')!;
    expect(destroyerWithoutThreat.submarineThreatScore).toBe(0);

    expect(destroyerWithThreat.score).toBeGreaterThan(destroyerWithoutThreat.score);
  });

  it('does not boost non-destroyer unit candidates from a submarine sighting (#542)', () => {
    const state = setupState(['carrier-warfare']);
    makeCoastal(state);
    const observed = { q: 8, r: 4 };
    state.civilizations['ai-1']!.knownCivilizations = ['player'];
    state.civilizations['ai-1']!.visibility.tiles[hexKey(observed)] = 'fog';
    const tile = state.map.tiles[hexKey(observed)];
    state.civilizations['ai-1']!.visibility.lastSeen = {
      [hexKey(observed)]: {
        coord: { ...observed },
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource: tile.resource,
        improvement: tile.improvement,
        improvementTurnsLeft: tile.improvementTurnsLeft,
        owner: tile.owner,
        hasRiver: tile.hasRiver,
        wonder: tile.wonder,
        observedTurn: state.turn,
        source: 'observed',
        units: [{ id: 'rival-sub', type: 'submarine', owner: 'player', healthBand: 'healthy' }],
      },
    };

    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [demand('frontline')], aggressive);
    const warrior = candidates.find(candidate => candidate.itemId === 'warrior');
    expect(warrior?.submarineThreatScore ?? 0).toBe(0);
  });

  it('offers Cuirassier for mobile demand only when the AI owns Horses and Iron', () => {
    const state = setupState([
      'animal-husbandry', 'bronze-working', 'rifle-tactics', 'professional-army',
    ]);
    grantResources(state, ['horses', 'iron']);

    const available = generateAIProductionCandidates(
      state, 'ai-1', 'city-a', [demand('mobile')], aggressive,
    );
    expect(available.find(candidate => candidate.itemId === 'cuirassier')?.roles)
      .toEqual(expect.arrayContaining(['mobile', 'capture']));

    grantResources(state, ['horses']);
    const ironBlocked = generateAIProductionCandidates(
      state, 'ai-1', 'city-a', [demand('mobile')], aggressive,
    );
    expect(ironBlocked.some(candidate => candidate.itemId === 'cuirassier')).toBe(false);
  });

  it('values the Cavalry Academy heavy-mounted discount through the canonical candidate ETA', () => {
    const state = setupState([
      'animal-husbandry', 'bronze-working', 'rifle-tactics', 'professional-army',
    ]);
    grantResources(state, ['horses', 'iron']);
    const undiscounted = generateAIProductionCandidates(
      state, 'ai-1', 'city-a', [demand('mobile')], aggressive,
    ).find(candidate => candidate.itemId === 'cuirassier');

    state.cities['city-a'].buildings = ['cavalry-academy'];
    const discounted = generateAIProductionCandidates(
      state, 'ai-1', 'city-a', [demand('mobile')], aggressive,
    ).find(candidate => candidate.itemId === 'cuirassier');

    expect(discounted?.productionTurns).toBeLessThan(undiscounted!.productionTurns);
  });

  it('does not generate a partially unlocked conjunctive unit candidate', () => {
    const state = setupState(['archery']);
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const candidates = generateAIProductionCandidates(
        state,
        'ai-1',
        'city-a',
        [demand('ranged')],
        aggressive,
      );
      expect(candidates.map(candidate => candidate.itemId)).not.toContain('archer');
    } finally {
      archer.requiredTechs = original;
    }
  });

  it('prioritizes a defensive espionage building only for a live detected city threat', () => {
    const state = setupState(['cold-war-networks', 'writing']);
    state.cities['city-a'].buildings = Object.keys(BUILDINGS)
      .filter(id => id !== 'security-bureau' && id !== 'library');
    state.espionage = {
      ...state.espionage,
      'ai-1': {
        ...createEspionageCivState(),
        detectedThreats: {
          hostile: {
            cityId: 'city-a', foreignCivId: 'player', detectedTurn: state.turn, expiresOnTurn: state.turn + 5,
          },
        },
      },
    };

    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const security = candidates.find(candidate => candidate.itemId === 'security-bureau')!;
    const library = candidates.find(candidate => candidate.itemId === 'library')!;
    expect(security.defensiveEspionageScore).toBe(40);
    expect(security.score).toBeGreaterThan(library.score);
    expect(applyAIProduction(state, 'ai-1', [], aggressive).cities['city-a'].productionQueue)
      .toEqual(['security-bureau']);

    const withoutThreat = { ...state, espionage: { ...state.espionage, 'ai-1': createEspionageCivState() } };
    const noThreatCandidates = generateAIProductionCandidates(withoutThreat, 'ai-1', 'city-a', [], aggressive);
    expect(noThreatCandidates.find(candidate => candidate.itemId === 'security-bureau')!.defensiveEspionageScore).toBe(0);
    expect(applyAIProduction(withoutThreat, 'ai-1', [], aggressive).cities['city-a'].productionQueue)
      .toEqual(['library']);
  });

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
        demand('anti-armor', 99),
        demand('ranged', 99),
        demand('siege', 99),
        demand('mobile', 99),
        demand('air-combat', 99),
        demand('air-defense', 99),
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
    // #545: warhead is arsenalCapacityGated -- researching nuclear-weapons alone
    // isn't enough, Manhattan Project must actually be built (this fixture grants
    // every tech but doesn't build anything), or it's correctly excluded from AI
    // candidates even though this maximal-availability fixture expects everything
    // researchable to also be a real candidate.
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };

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
      getReservedNationalProjectKeys(state, 'ai-1'),
      'ai-1',
      {
        hasManhattanProject: hasManhattanProject(state, 'ai-1'),
        atCapacity: getStrategicArsenal(state.civilizations['ai-1']) >= getStrategicArsenalCapacity(state, 'ai-1'),
      },
      getCapitalCityId(state, 'ai-1'),
    );

    for (const building of available) {
      expect(generated, building.id).toContain(building.id);
    }
  });

  it('offers Bunker to an AI city with Walls and Reinforced Concrete through the shared building catalog', () => {
    const state = setupState(['reinforced-concrete']);
    state.cities['city-a'].buildings = ['walls'];

    const candidates = generateAIProductionCandidates(
      state,
      'ai-1',
      'city-a',
      [],
      aggressive,
    );

    expect(candidates).toContainEqual(expect.objectContaining({
      itemId: 'bunker', kind: 'building', productionTurns: expect.any(Number),
    }));
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
  it('values a library by its non-negative marginal net research in the city that builds it', () => {
    const state = setupState(['writing'], ['city-a', 'city-b']);
    // Keep city-a securely first in the coordinated-science ordering so the
    // same library has a larger net empire effect there than in city-b.
    state.cities['city-a']!.buildings.push('shrine', 'archive', 'observatory');

    const strongestCityLibrary = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'library')!;
    const marginalCityLibrary = generateAIProductionCandidates(state, 'ai-1', 'city-b', [], aggressive)
      .find(candidate => candidate.itemId === 'library')!;

    expect(strongestCityLibrary.researchValueScore).toBeGreaterThan(marginalCityLibrary.researchValueScore);
    expect(marginalCityLibrary.researchValueScore).toBeGreaterThanOrEqual(0);

    const eraTwoTechs = TECH_TREE
      .filter(tech => tech.era <= 2 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    const projectState = setupState([...eraTwoTechs, 'mathematics']);
    const scribesHall = generateAIProductionCandidates(projectState, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'scribes_hall')!;
    expect(scribesHall.researchValueScore).toBeGreaterThan(0);
  });

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

describe('#919 MR2 — AI values unrest relief (Courthouse)', () => {
  const era2Techs = TECH_TREE.filter(tech => tech.era <= 2 && tech.countsForEraAdvancement !== false)
    .map(tech => tech.id);

  // Twelve cities. `city-a` is placed far from `cap` (distance row) when `far` is set,
  // else clustered (no sprawl on city-a). Same city count/cost/production in both, so a
  // courthouse's productionTurns/maintenance terms are identical between them — only the
  // pressure-conditioned relief term differs.
  function empire(opts: { far: boolean; warCount: number }): GameState {
    const state = setupState([...era2Techs, 'magistracy'], ['cap', 'city-a']);
    const civ = state.civilizations['ai-1'];
    state.cities['cap'].position = { q: 0, r: 0 };
    state.cities['cap'].buildings = [];
    state.cities['city-a'].position = opts.far ? { q: 30, r: 0 } : { q: 1, r: 0 };
    state.cities['city-a'].buildings = [];
    state.cities['city-a'].population = 6;
    for (let i = 3; i <= 12; i++) {
      const clone = { ...state.cities['city-a'], id: `c${i}`, position: { q: i, r: 6 }, buildings: [] as string[] };
      state.cities[`c${i}`] = clone;
      civ.cities.push(`c${i}`);
    }
    civ.diplomacy.atWarWith = Array.from({ length: opts.warCount }, (_, i) => `enemy-${i}`);
    civ.gold = 5000;
    return state;
  }

  function candidate(state: GameState, id: string) {
    return generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(c => c.itemId === id)!;
  }

  it('scores courthouse relief only for a city a courthouse would actually help, and feeds it into .score', () => {
    const pressured = empire({ far: true, warCount: 2 });   // city-a: overextension + distance
    const calm = empire({ far: false, warCount: 0 });        // 12 cities but city-a clustered

    // city-a is genuinely over the unrest trigger in the pressured empire.
    expect(computeUnrestPressure('city-a', pressured, 0)).toBeGreaterThan(40);

    const chP = candidate(pressured, 'courthouse');
    const monP = candidate(pressured, 'monument');
    const chC = candidate(calm, 'courthouse');

    // monument (+1 gold, era 1, not in UNREST_RELIEF_SOURCES) never gets relief — proves
    // the term is keyed to the relief table, not to "cheap culture building".
    expect(monP.unrestReliefScore).toBe(0);
    // A courthouse in the clustered city still sees an empire-overextension row (12 cities),
    // so it gets SOME relief — but strictly less than the far city that also pays distance.
    expect(chP.unrestReliefScore).toBeGreaterThan(chC.unrestReliefScore);
    expect(chC.unrestReliefScore).toBeGreaterThan(0);

    // The relief term is a real positive contributor to the final score, not discarded.
    const reconstruct = (c: typeof chP, includeRelief: boolean) =>
      c.economyScore * 2 + c.personalityScore + c.citySpecializationScore
      + c.defensiveEspionageScore + c.airDefenseThreatScore + c.strategicArsenalValueScore
      + (includeRelief ? c.unrestReliefScore : 0)
      - c.productionTurns * 1.5 - c.maintenanceRisk * 3;
    expect(reconstruct(chP, true)).toBeCloseTo(chP.score, 6);
    expect(reconstruct(chP, false)).toBeLessThan(chP.score);

    // Delta-of-deltas: courthouse-vs-monument gap is larger in the pressured empire, and
    // the extra gap is exactly the pressured courthouse's relief score (monument relief is
    // 0 both sides; productionTurns/maintenance are identical across the two fixtures).
    const monC = candidate(calm, 'monument');
    const gapPressured = chP.score - monP.score;
    const gapCalm = chC.score - monC.score;
    expect(gapPressured - gapCalm).toBeCloseTo(chP.unrestReliefScore - chC.unrestReliefScore, 4);
  });

  it('a tall, low-pressure AI city assigns courthouse zero relief score', () => {
    const state = setupState([...era2Techs, 'magistracy'], ['city-a', 'c2', 'c3']);
    state.cities['city-a'].buildings = [];
    // city-a is cities[0] => the capital => distance row 0; only 3 cities => no overextension row.
    expect(computeUnrestPressure('city-a', state, 0)).toBe(0);

    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const courthouse = candidates.find(c => c.itemId === 'courthouse');
    expect(courthouse?.unrestReliefScore ?? 0).toBe(0);
  });

  it('#927: values a Regional Capital at a non-capital seat for the pressure it relieves across the empire', () => {
    const era4Techs = TECH_TREE.filter(tech => tech.era <= 4 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    const state = setupState([...era4Techs, 'political-philosophy'], ['cap', 'city-a']);
    const civ = state.civilizations['ai-1'];
    state.cities.cap.position = { q: 0, r: 0 };
    state.cities['city-a'].position = { q: 30, r: 0 };
    for (let i = 3; i <= 12; i++) {
      const clone = { ...state.cities['city-a'], id: `regional-${i}`, position: { q: 24 + i, r: 0 }, buildings: [] as string[] };
      state.cities[clone.id] = clone;
      civ.cities.push(clone.id);
    }

    const regionalCapital = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'regional_capital');

    expect(regionalCapital).toBeDefined();
    expect(regionalCapital?.unrestReliefScore).toBeGreaterThan(0);
  });

  it.each(['explorer', 'standard', 'veteran'] as const)(
    '#926: values Military Administration identically for %s difficulty when war and conquest pressure apply',
    difficulty => {
      const completed = TECH_TREE.filter(tech => tech.era <= 3 && tech.countsForEraAdvancement !== false)
        .map(tech => tech.id);
      const state = setupState([...completed, 'civil-service']);
      state.opponentChallenge = difficulty;
      state.cities['city-a']!.conquestTurn = state.turn;
      state.civilizations['ai-1'].diplomacy.atWarWith = ['enemy-1', 'enemy-2', 'enemy-3'];

      const administration = candidate(state, 'military-administration');

      expect(administration.unrestReliefScore).toBeGreaterThan(0);
      expect(administration.unrestReliefScore).toBe(27);
    },
  );
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

  it('Attack Helicopter production candidate is byte-identical whether or not its airAssault capability field is present (regression for the "no production reweighting" design decision, #543 Phase 2)', () => {
    const state = setupState(['helicopter-warfare']);
    state.cities['city-a']!.buildings = ['helicopter_base'];
    const demands = [demand('ranged')];

    const withCapability = generateAIProductionCandidates(state, 'ai-1', 'city-a', demands, aggressive)
      .find(c => c.itemId === 'attack_helicopter');
    expect(withCapability).toBeDefined();

    const originalAirAssault = UNIT_DEFINITIONS.attack_helicopter.airAssault;
    delete UNIT_DEFINITIONS.attack_helicopter.airAssault;
    try {
      const withoutCapability = generateAIProductionCandidates(state, 'ai-1', 'city-a', demands, aggressive)
        .find(c => c.itemId === 'attack_helicopter');
      expect(withoutCapability).toEqual(withCapability);
    } finally {
      UNIT_DEFINITIONS.attack_helicopter.airAssault = originalAirAssault;
    }
  });
});

describe('AI carrier deck composition nudging (#582)', () => {
  it('discounts a candidate role already well-represented on a specific carrier\'s current air wing', () => {
    const stackedState = setupState(['jet-aviation', 'carrier-warfare']);
    const stackedCity = stackedState.cities['city-a']!;
    stackedCity.buildings = ['airfield'];
    const carrier = { ...createUnit('carrier', 'ai-1', stackedCity.position, stackedState.idCounters), id: 'carrier-1' };
    stackedState.units[carrier.id] = carrier;
    stackedState.civilizations['ai-1']!.units.push(carrier.id);
    const aboardFighter = { ...createUnit('jet_fighter', 'ai-1', stackedCity.position, stackedState.idCounters), id: 'fighter-aboard', airBase: { kind: 'carrier' as const, unitId: carrier.id } };
    stackedState.units[aboardFighter.id] = aboardFighter;
    stackedState.civilizations['ai-1']!.units.push(aboardFighter.id);

    const stackedCandidate = generateAIProductionCandidates(stackedState, 'ai-1', 'city-a', [demand('air-combat')], aggressive)
      .find(c => c.itemId === 'jet_fighter')!;

    const emptyState = setupState(['jet-aviation', 'carrier-warfare']);
    const emptyCity = emptyState.cities['city-a']!;
    emptyCity.buildings = ['airfield'];
    const emptyCarrier = { ...createUnit('carrier', 'ai-1', emptyCity.position, emptyState.idCounters), id: 'carrier-1' };
    emptyState.units[emptyCarrier.id] = emptyCarrier;
    emptyState.civilizations['ai-1']!.units.push(emptyCarrier.id);

    const emptyCandidate = generateAIProductionCandidates(emptyState, 'ai-1', 'city-a', [demand('air-combat')], aggressive)
      .find(c => c.itemId === 'jet_fighter')!;

    expect(stackedCandidate.carrierCompositionScore).toBeLessThan(emptyCandidate.carrierCompositionScore);
    expect(stackedCandidate.score).toBeLessThan(emptyCandidate.score);
  });

  it('boosts patrol-aircraft candidate scoring when a remembered hostile submarine sighting exists near a civ-owned carrier', () => {
    const state = setupState(['carrier-warfare', 'radar-systems']);
    const city = state.cities['city-a']!;
    city.buildings = ['airfield'];
    const carrier = { ...createUnit('carrier', 'ai-1', city.position, state.idCounters), id: 'carrier-1' };
    state.units[carrier.id] = carrier;
    state.civilizations['ai-1']!.units.push(carrier.id);

    const observed = { q: 8, r: 4 };
    state.civilizations['ai-1']!.knownCivilizations = ['player'];
    state.civilizations['ai-1']!.visibility.tiles[hexKey(observed)] = 'fog';
    const tile = state.map.tiles[hexKey(observed)];
    state.civilizations['ai-1']!.visibility.lastSeen = {
      [hexKey(observed)]: {
        coord: { ...observed },
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource: tile.resource,
        improvement: tile.improvement,
        improvementTurnsLeft: tile.improvementTurnsLeft,
        owner: tile.owner,
        hasRiver: tile.hasRiver,
        wonder: tile.wonder,
        observedTurn: state.turn,
        source: 'observed',
        units: [{ id: 'rival-sub', type: 'submarine', owner: 'player', healthBand: 'healthy' }],
      },
    };

    const withThreat = generateAIProductionCandidates(state, 'ai-1', 'city-a', [demand('recon')], aggressive)
      .find(c => c.itemId === 'maritime_patrol_aircraft')!;
    expect(withThreat.carrierCompositionScore).toBeGreaterThan(0);

    const withoutThreatState = { ...state, civilizations: { ...state.civilizations, 'ai-1': { ...state.civilizations['ai-1']!, visibility: { ...state.civilizations['ai-1']!.visibility, lastSeen: {} } } } };
    const withoutThreat = generateAIProductionCandidates(withoutThreatState, 'ai-1', 'city-a', [demand('recon')], aggressive)
      .find(c => c.itemId === 'maritime_patrol_aircraft')!;
    expect(withoutThreat.carrierCompositionScore).toBe(0);

    expect(withThreat.score).toBeGreaterThan(withoutThreat.score);
  });

  it('scales the patrol submarine-threat bonus by difficulty, matching submarineThreatScore\'s own submarineEscortWeight convention', () => {
    function makeThreatenedState(challenge: 'explorer' | 'veteran') {
      const state = setupState(['carrier-warfare', 'radar-systems']);
      state.opponentChallenge = challenge;
      const city = state.cities['city-a']!;
      city.buildings = ['airfield'];
      const carrier = { ...createUnit('carrier', 'ai-1', city.position, state.idCounters), id: 'carrier-1' };
      state.units[carrier.id] = carrier;
      state.civilizations['ai-1']!.units.push(carrier.id);

      const observed = { q: 8, r: 4 };
      state.civilizations['ai-1']!.knownCivilizations = ['player'];
      state.civilizations['ai-1']!.visibility.tiles[hexKey(observed)] = 'fog';
      const tile = state.map.tiles[hexKey(observed)];
      state.civilizations['ai-1']!.visibility.lastSeen = {
        [hexKey(observed)]: {
          coord: { ...observed },
          terrain: tile.terrain,
          elevation: tile.elevation,
          resource: tile.resource,
          improvement: tile.improvement,
          improvementTurnsLeft: tile.improvementTurnsLeft,
          owner: tile.owner,
          hasRiver: tile.hasRiver,
          wonder: tile.wonder,
          observedTurn: state.turn,
          source: 'observed',
          units: [{ id: 'rival-sub', type: 'submarine', owner: 'player', healthBand: 'healthy' }],
        },
      };
      return state;
    }

    const explorerScore = generateAIProductionCandidates(makeThreatenedState('explorer'), 'ai-1', 'city-a', [demand('recon')], aggressive)
      .find(c => c.itemId === 'maritime_patrol_aircraft')!.carrierCompositionScore;
    const veteranScore = generateAIProductionCandidates(makeThreatenedState('veteran'), 'ai-1', 'city-a', [demand('recon')], aggressive)
      .find(c => c.itemId === 'maritime_patrol_aircraft')!.carrierCompositionScore;

    expect(explorerScore).toBeGreaterThan(0);
    expect(veteranScore).toBeGreaterThan(explorerScore);
  });

  it('does not boost patrol scoring when no submarine has actually been perceived by this civ (no hidden information)', () => {
    const state = setupState(['carrier-warfare', 'radar-systems']);
    const city = state.cities['city-a']!;
    city.buildings = ['airfield'];
    const carrier = { ...createUnit('carrier', 'ai-1', city.position, state.idCounters), id: 'carrier-1' };
    state.units[carrier.id] = carrier;
    state.civilizations['ai-1']!.units.push(carrier.id);

    // A real hostile submarine exists in raw GameState, far from any AI
    // detector, with no visibility.lastSeen entry -- genuinely unscouted.
    const hiddenSub = { ...createUnit('submarine', 'player', { q: 20, r: 20 }, state.idCounters), id: 'unseen-sub' };
    state.units[hiddenSub.id] = hiddenSub;
    state.civilizations.player.units.push(hiddenSub.id);

    const candidate = generateAIProductionCandidates(state, 'ai-1', 'city-a', [demand('recon')], aggressive)
      .find(c => c.itemId === 'maritime_patrol_aircraft')!;
    expect(candidate.carrierCompositionScore).toBe(0);
  });
});
