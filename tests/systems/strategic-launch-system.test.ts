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
