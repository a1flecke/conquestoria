import { describe, it, expect } from 'vitest';
import { generateBalancedMap } from '@/systems/balanced-map-generator';
import { generateContinentMap } from '@/systems/continent-map-generator';
import { tagLandmassRegions } from '@/systems/landmass-tagger';
import { computeThreatScore, empireShare, nearestLandmassId, recordCombatForCiv, processLandResurgence, processThreatPressure } from '@/systems/threat-pressure-system';
import type { GameMap, GameState, HexTile, Civilization } from '@/core/types';

function makeTestState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  // 10 land tiles tagged continent-0
  for (let q = 0; q < 10; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: q < 8 ? 'p1' : null, improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, regionKey: 'continent-0',
    };
  }
  // ocean tile adjacent for nearestLandmassId test
  tiles['0,1'] = {
    coord: { q: 0, r: 1 }, terrain: 'ocean', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };

  const p1: Civilization = {
    id: 'p1', name: 'Player 1', color: '#fff', isHuman: true, civType: 'rome',
    cities: ['city-1'], units: [],
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    gold: 0, visibility: { tiles: {} }, score: 0,
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
    lastCombatTurnByLandmass: {},
  };

  return {
    turn: 10, era: 2,
    civilizations: { p1 },
    map: { width: 15, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { 'city-1': { id: 'city-1', owner: 'p1', position: { q: 0, r: 0 } } as any },
    barbarianCamps: {}, minorCivs: {}, currentPlayer: 'p1',
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false, winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    ...overrides,
  } as unknown as GameState;
}

describe('landmass tagging', () => {
  it('generateBalancedMap assigns regionKey to all land tiles', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed', 2);
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey, `tile at ${tile.coord.q},${tile.coord.r} missing regionKey`).toBeDefined();
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });

  it('ocean tiles have no regionKey', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed-2', 2);
    const oceanTiles = Object.values(map.tiles).filter(t => t.terrain === 'ocean');
    for (const tile of oceanTiles) {
      expect(tile.regionKey).toBeUndefined();
    }
  });
});

describe('tagLandmassRegions', () => {
  function makeTile(q: number, r: number, terrain: string): HexTile {
    return {
      coord: { q, r }, terrain: terrain as any, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }

  it('assigns continent-0 to the largest connected land component (≥9 tiles)', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile connected component (large enough for continent threshold=9)
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component (island)
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['0,0'].regionKey).toBe('continent-0');
    expect(tagged['4,1'].regionKey).toBe('continent-0');
  });

  it('labels components under 9 tiles as island-N', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile large component
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['8,8'].regionKey).toMatch(/^island-\d+$/);
  });

  it('leaves ocean tiles without regionKey', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile(0, 0, 'grassland');
    tiles['1,0'] = makeTile(1, 0, 'ocean');
    const map: GameMap = { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['1,0'].regionKey).toBeUndefined();
  });
});

describe('processLandResurgence', () => {
  function makeResurgenceState(): GameState {
    const state = makeTestState({ era: 2, turn: 30 });
    // Player idle for 15 turns (score ≥ 2.5)
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 15 };
    // 8 of 10 tiles owned = 80% dominance
    return state;
  }

  it('spawns a resurgent camp when score ≥ 2.5 and cooldown passed', () => {
    const state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBeGreaterThan(0);
  });

  it('does not spawn when score < 2.5', () => {
    const state = makeTestState({ era: 1, turn: 5 });
    // Low score: era 1, idle 0 turns, low ownership
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 5 };
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBe(0);
  });

  it('does not spawn when cooldown is active', () => {
    const state = makeResurgenceState();
    state.resurgentCampCooldownByCivLandmass = { 'p1:continent-0': 35 }; // cooldown until turn 35
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBe(0);
  });

  it('camp strength scales with era', () => {
    const state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const camp = Object.values(updated.barbarianCamps).find(c => c.resurgent);
    expect(camp?.strength).toBeGreaterThanOrEqual(6); // era-2 minimum
    expect(camp?.strength).toBeLessThanOrEqual(10);   // era-2 maximum
  });
});

describe('processThreatPressure — hot-seat isolation', () => {
  it('only evaluates human players — AI civ never gets resurgence', () => {
    const state = makeTestState({ era: 3, turn: 30 });
    state.civilizations['p1'].isHuman = false;
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    processThreatPressure(state, 'p1', bus);
    expect(events.filter(e => e.e === 'threat:barbarian-resurgence').length).toBe(0);
  });

  it('multi-landmass: evaluates each landmass independently', () => {
    const state = makeTestState({ era: 2, turn: 30 });
    // Add continent-1 tiles
    for (let q = 20; q < 30; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        regionKey: 'continent-1',
      };
    }
    // Add city on continent-1
    state.cities['city-2'] = { id: 'city-2', owner: 'p1', position: { q: 20, r: 0 } } as any;
    state.civilizations['p1'].cities.push('city-2');
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 15, 'continent-1': 15 };

    const score0 = computeThreatScore(state, 'p1', 'continent-0');
    const score1 = computeThreatScore(state, 'p1', 'continent-1');
    expect(score0).toBeGreaterThan(2.5);
    expect(score1).toBeGreaterThan(2.5);
  });
});

describe('continent-map-generator landmass tagging', () => {
  it('assigns regionKey to all non-ocean tiles', () => {
    const { map } = generateContinentMap(40, 40, 'continent-test');
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });
});

describe('empireShare', () => {
  it('returns ~0.8 when 8 of 10 viable tiles are owned by player', () => {
    const state = makeTestState();
    const share = empireShare(state, 'p1', 'continent-0');
    expect(share).toBeCloseTo(0.8, 1);
  });

  it('returns 0 when player owns no tiles', () => {
    const state = makeTestState();
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    expect(empireShare(state, 'p1', 'continent-0')).toBe(0);
  });
});

describe('computeThreatScore', () => {
  it('returns ~1 for era-1 player with no empire share and 0 idle turns', () => {
    const state = makeTestState({ era: 1, turn: 5 });
    // Remove all ownership so empireShare = 0
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 5 }; // no idle
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(1.0, 1); // era 1 × (1 + 0 + 0) = 1.0
  });

  it('returns > 5 for era-2 dominant player with 10 idle turns', () => {
    const state = makeTestState({ era: 2, turn: 20 });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(5);
  });

  it('returns 0 for AI civ', () => {
    const state = makeTestState();
    state.civilizations['p1'].isHuman = false;
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBe(0);
  });

  it('returns 0 when civ has no city on landmass', () => {
    const state = makeTestState();
    state.civilizations['p1'].cities = [];
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBe(0);
  });
});

describe('nearestLandmassId', () => {
  it('finds continent-0 from adjacent ocean tile', () => {
    const state = makeTestState();
    // tile '0,1' is ocean adjacent to '0,0' which has regionKey continent-0
    const id = nearestLandmassId({ q: 0, r: 1 }, state.map);
    expect(id).toBe('continent-0');
  });

  it('returns null when no land within 10 tiles', () => {
    const state = makeTestState();
    // Replace all land tiles with ocean
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'ocean', regionKey: undefined };
    }
    const id = nearestLandmassId({ q: 0, r: 0 }, state.map);
    expect(id).toBeNull();
  });
});

describe('recordCombatForCiv', () => {
  it('updates lastCombatTurnByLandmass for the combat landmass', () => {
    const state = makeTestState({ turn: 15 });
    state.civilizations['p1'].lastCombatTurnByLandmass = {};
    // tile '0,0' has regionKey 'continent-0'
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 0 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(15);
  });

  it('uses nearestLandmassId when the combat tile has no regionKey', () => {
    const state = makeTestState({ turn: 20 });
    state.civilizations['p1'].lastCombatTurnByLandmass = {};
    // tile '0,1' is ocean with no regionKey, but adjacent to continent-0
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 1 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(20);
  });
});
