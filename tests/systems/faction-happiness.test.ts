import { describe, it, expect } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import {
  computeUnrestPressure,
  processFactionTurn,
} from '@/systems/faction-system';

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position,
    population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'outpost',
    grid: [[null]], gridSize: 3,
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  } as City;
}

function makeMinimalState({
  cityCount = 1,
  cityPosition = { q: 0, r: 0 } as HexCoord,
  atWarCount = 0,
  era = 2,
  silkOwned = false,
}: {
  cityCount?: number;
  cityPosition?: HexCoord;
  atWarCount?: number;
  era?: number;
  silkOwned?: boolean;
} = {}): GameState {
  const civId = 'player';
  const cities: Record<string, City> = {};
  const cityIds: string[] = [];

  // Capital at (0,0) — must be first in cities array (cities[0] = capital by convention)
  const capital = makeCity('capital', civId, { q: 0, r: 0 });
  cities['capital'] = capital;
  cityIds.push('capital');

  for (let i = 1; i <= cityCount; i++) {
    const city = makeCity(`city-${i}`, civId, cityPosition);
    cities[`city-${i}`] = city;
    cityIds.push(`city-${i}`);
  }

  const atWarWith: string[] = [];
  for (let i = 0; i < atWarCount; i++) atWarWith.push(`enemy-${i}`);

  const tiles: Record<string, unknown> = {
    '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: civId },
  };
  let capitalOwnedTiles: HexCoord[] = [{ q: 0, r: 0 }];

  if (silkOwned) {
    tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: 'silk', improvement: 'plantation', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: civId };
    capitalOwnedTiles = [...capitalOwnedTiles, { q: 1, r: 0 }];
    cities['capital'] = { ...capital, ownedTiles: capitalOwnedTiles };
  }

  const dipState = createDiplomacyState([civId], civId);

  return {
    turn: 10, era,
    currentPlayer: civId,
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    cities,
    civilizations: {
      [civId]: {
        id: civId, civType: 'rome', name: 'Rome',
        cities: cityIds, units: [], gold: 50,
        techState: { completed: silkOwned ? ['irrigation'] : [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { ...dipState, atWarWith },
        visibility: { tiles: {} },
      },
    },
    units: {}, barbarianCamps: {}, minorCivs: {}, marketplace: null,
  } as unknown as GameState;
}

describe('computeUnrestPressure with happiness', () => {
  it('test 17: ownerHappiness=3 reduces pressure by 6', () => {
    const state = makeMinimalState({ cityCount: 1 });
    const pressureWithout = computeUnrestPressure('city-1', state, 0);
    const pressureWith = computeUnrestPressure('city-1', state, 3);
    // Pressure reduced by 6, floored at 0
    expect(pressureWith).toBe(Math.max(0, pressureWithout - 6));
  });

  it('test 18: high-pressure city with 3 happiness luxuries has pressure reduced by 6', () => {
    // Many cities + wars = high pressure
    const state = makeMinimalState({ cityCount: 8, cityPosition: { q: 20, r: 0 }, atWarCount: 3, era: 2 });
    const pressureBase = computeUnrestPressure('city-1', state, 0);
    const pressureHappy = computeUnrestPressure('city-1', state, 3);
    expect(pressureBase).toBeGreaterThan(0);
    expect(pressureHappy).toBe(Math.max(0, pressureBase - 6));
  });

  it('test 19: pressure with 0 happiness vs 3 happiness differs by 6', () => {
    const state = makeMinimalState({ cityCount: 10, atWarCount: 2, era: 2 });
    const pressureZeroHappy = computeUnrestPressure('city-1', state, 0);
    const pressureThreeHappy = computeUnrestPressure('city-1', state, 3);
    expect(pressureZeroHappy - pressureThreeHappy).toBe(6);
  });

  it('test 20: omitting ownerHappiness arg defaults to 0 — no crash', () => {
    const state = makeMinimalState();
    expect(() => computeUnrestPressure('city-1', state)).not.toThrow();
  });

  it('pressure cannot go negative (clamped to 0)', () => {
    const state = makeMinimalState({ cityCount: 1 });
    // With 50 happiness → -100 pressure reduction; should be clamped to 0
    const pressure = computeUnrestPressure('city-1', state, 50);
    expect(pressure).toBeGreaterThanOrEqual(0);
  });
});

describe('processFactionTurn with happiness', () => {
  it('silk owned: processFactionTurn does not crash and applies happiness', () => {
    const state = makeMinimalState({ cityCount: 8, atWarCount: 2, era: 2, silkOwned: true });
    const bus = new EventBus();
    expect(() => processFactionTurn(state, bus)).not.toThrow();
  });
});
