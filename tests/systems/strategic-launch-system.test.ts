import { describe, it, expect } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';
import { hexKey } from '@/systems/hex-utils';

function visibleAt(...coords: HexCoord[]) {
  return { tiles: Object.fromEntries(coords.map(c => [hexKey(c), 'visible' as const])), lastSeen: {} };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, era: 11, currentPlayer: 'p1',
    civilizations: {}, cities: {}, units: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [], gameOver: false, winner: null,
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('getEligibleStrategicLaunchPlatforms', () => {
  it('is empty with no cities or units', () => {
    expect(getEligibleStrategicLaunchPlatforms(makeState(), 'p1')).toEqual([]);
  });

  it('includes an owned city with a missile_silo, keyed off the typed field not the id', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    const platforms = getEligibleStrategicLaunchPlatforms(state, 'p1');
    expect(platforms).toEqual([
      { kind: 'building', cityId: 'c1', buildingId: 'missile_silo', position: { q: 2, r: 3 }, range: 'unlimited' },
    ]);
  });

  it('excludes a missile_silo city owned by another civ', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p2', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a city with no capability-granting building', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['nuclear_arsenal'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('includes an owned missile_submarine unit at its current position', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([
      { kind: 'unit', unitId: 'u1', unitType: 'missile_submarine', position: { q: 5, r: 5 }, range: 4 },
    ]);
  });

  it('excludes a missile_submarine owned by another civ', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p2', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a unit type with no strategicLaunchPlatform capability', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('combines building and unit platforms across multiple cities/units', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any },
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toHaveLength(2);
  });
});

import { getStrategicLaunchLegality } from '@/systems/strategic-launch-system';
import type { Civilization } from '@/core/types';

const AT_WAR_WITH_P2 = { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } };
const AT_PEACE = { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } };
const TARGET_POS = { q: 3, r: 3 };

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: AT_PEACE,
    ...overrides,
  } as Civilization;
}

// p1 can see the target city's tile unless a test overrides its visibility.
function makeLegalityState(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    civilizations: {
      p1: makeCiv({ cities: ['c1'], visibility: visibleAt(TARGET_POS) }),
      p2: makeCiv({ id: 'p2', cities: [] }),
    },
    cities: {
      c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
      target: { id: 'target', name: 'Target', owner: 'p2', position: TARGET_POS } as any,
    },
    ...overrides,
  });
}

describe('getStrategicLaunchLegality', () => {
  it('is legal when arsenal >= 1, platform in range, discovered, and at war', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: visibleAt(TARGET_POS), strategicArsenal: 1, diplomacy: AT_WAR_WITH_P2 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    const result = getStrategicLaunchLegality(state, 'p1', 'target');
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown target city', () => {
    const result = getStrategicLaunchLegality(makeLegalityState(), 'p1', 'nobody');
    expect(result).toEqual({ ok: false, reason: 'unknown-target-city' });
  });

  it('rejects with no-arsenal when strategicArsenal is 0/absent, all else legal', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: visibleAt(TARGET_POS), diplomacy: AT_WAR_WITH_P2 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-arsenal' });
  });

  it('rejects with not-at-war when arsenal/platform/discovery are all satisfied but not at war', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: visibleAt(TARGET_POS), strategicArsenal: 1 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'not-at-war' });
  });

  it('rejects with target-not-discovered when the target city has not been explored', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, lastSeen: {} }, strategicArsenal: 1, diplomacy: AT_WAR_WITH_P2 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'target-not-discovered' });
  });

  it('rejects with no-eligible-platform when arsenal/war/discovery are satisfied but no platform is in range', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: visibleAt(TARGET_POS), strategicArsenal: 1, diplomacy: AT_WAR_WITH_P2 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
      cities: {
        // no silo/sub anywhere -- c1 has no capability-granting building
        c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: [] } as any,
        target: { id: 'target', name: 'Target', owner: 'p2', position: TARGET_POS } as any,
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });

  it('rejects with no-eligible-platform when a submarine platform exists but is out of range', () => {
    const farTarget = { q: 30, r: 0 };
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: [], visibility: visibleAt(farTarget), strategicArsenal: 1, diplomacy: AT_WAR_WITH_P2 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
      cities: {
        target: { id: 'target', name: 'Target', owner: 'p2', position: farTarget } as any,
      },
      units: {
        u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 0, r: 0 } } as any,
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });
});

import { BUILDINGS as CityBuildings, foundCity, getAvailableBuildings, completeCityProductionItem } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeTestCity(seed: string) {
  const map = generateMap(30, 30, seed);
  const landTile = Object.values(map.tiles).find(tile => tile.terrain === 'grassland')!;
  const city = foundCity('p1', landTile.coord, map, mkC());
  return { map, city };
}

describe('warhead production item (#545)', () => {
  it('is gated by nuclear-weapons + uranium, repeatable, arsenal-capacity gated, zero yields', () => {
    const warhead = CityBuildings.warhead;
    expect(warhead).toBeDefined();
    expect(warhead.techRequired).toBe('nuclear-weapons');
    expect(warhead.resourceRequired).toEqual(['uranium']);
    expect(warhead.consumedOnCompletion).toBe(true);
    expect(warhead.arsenalCapacityGated).toBe(true);
    expect(warhead.uniquePerEmpire).toBeUndefined();
    expect(warhead.nationalProject).toBeUndefined();
    expect(warhead.yields).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('getAvailableBuildings: warhead is available when arsenalStatus is omitted (skips the gate)', () => {
    const { map, city } = makeTestCity('warhead-gate-omitted');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map);
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('getAvailableBuildings: warhead is hidden when Manhattan Project is unbuilt', () => {
    const { map, city } = makeTestCity('warhead-no-manhattan');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: false, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is hidden when at arsenal capacity', () => {
    const { map, city } = makeTestCity('warhead-at-capacity');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: true });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is available when Manhattan Project is done and under capacity', () => {
    const { map, city } = makeTestCity('warhead-under-capacity');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('completeCityProductionItem: completing warhead fires completedBuilding but never persists into city.buildings', () => {
    const { city } = makeTestCity('warhead-complete');
    city.productionQueue = ['warhead'];
    city.productionProgress = 260;
    const result = completeCityProductionItem(city, 'warhead');
    expect(result.completedBuilding).toBe('warhead');
    expect(result.city.buildings).not.toContain('warhead');
  });

  it('completeCityProductionItem: warhead is immediately re-completable (queue it twice in a row)', () => {
    const { city } = makeTestCity('warhead-complete-twice');
    city.productionQueue = ['warhead', 'warhead'];
    city.productionProgress = 260;
    const first = completeCityProductionItem(city, 'warhead');
    const second = completeCityProductionItem(first.city, 'warhead');
    expect(first.completedBuilding).toBe('warhead');
    expect(second.completedBuilding).toBe('warhead');
    expect(second.city.buildings).not.toContain('warhead');
  });
});

describe('strategic launch platform wiring (#545)', () => {
  it('missile_silo has unlimited-range strategicLaunchPlatform', () => {
    expect(BUILDINGS.missile_silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
  });

  it('missile_submarine has range-4 strategicLaunchPlatform, existing attackProfile untouched', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(def.attackProfile).toEqual({ kind: 'ranged', range: 3, targets: ['unit', 'city'] });
  });
});
