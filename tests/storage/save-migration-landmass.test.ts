import { describe, it, expect } from 'vitest';
import type { GameState, HexTile } from '@/core/types';

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(),
  dbPut: vi.fn(),
  dbDelete: vi.fn(),
  dbGetAllKeys: vi.fn(async () => []),
}));

import { vi } from 'vitest';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';

function makeLegacyState(): GameState {
  const tiles: Record<string, HexTile> = {
    '0,0': { coord: { q:0, r:0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    '1,0': { coord: { q:1, r:0 }, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    '0,1': { coord: { q:0, r:1 }, terrain: 'ocean', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
  };
  return {
    map: { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    civilizations: {},
    units: {},
    cities: {},
    barbarianCamps: {},
    minorCivs: {},
    currentPlayer: 'p1',
    turn: 1,
    era: 1,
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false,
    winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('normalizeLandmassKeys migration', () => {
  it('adds regionKey to land tiles on old saves with no regionKey', () => {
    const state = makeLegacyState();
    expect(state.map.tiles['0,0'].regionKey).toBeUndefined();

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.map.tiles['0,0'].regionKey).toMatch(/^(continent|island)-\d+$/);
    expect(normalized.map.tiles['1,0'].regionKey).toMatch(/^(continent|island)-\d+$/);
    expect(normalized.map.tiles['0,1'].regionKey).toBeUndefined();
  });

  it('is idempotent — already-tagged tiles are not re-tagged', () => {
    const state = makeLegacyState();
    state.map.tiles['0,0'] = { ...state.map.tiles['0,0'], regionKey: 'continent-0' };
    state.map.tiles['1,0'] = { ...state.map.tiles['1,0'], regionKey: 'continent-0' };

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.map.tiles['0,0'].regionKey).toBe('continent-0');
    expect(normalized.map.tiles['1,0'].regionKey).toBe('continent-0');
  });
});
