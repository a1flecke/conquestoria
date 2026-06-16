import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { migrateLegacyCoastalData } from '@/storage/save-manager';

const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { createDefaultSettings } from '@/core/game-state';
import { autoSave, deleteSaveEntry, listSaveEpics, listSaves, loadGame, loadMostRecentAutoSave, loadSettings, saveGame, saveSettings } from '@/storage/save-manager';
import type { CustomCivDefinition } from '@/core/types';
import { makeAutoExploreFixture } from '../systems/helpers/auto-explore-fixture';

const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('save-manager autosave listing', () => {
  beforeEach(() => {
    dbState.clear();
    (globalThis as typeof globalThis & { localStorage?: ReturnType<typeof makeLocalStorageMock> }).localStorage = makeLocalStorageMock();
  });

  it('includes autosave as the first list entry when requested', async () => {
    await autoSave({
      turn: 9,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);

    await saveGame('slot-1', 'Manual Save', {
      turn: 4,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'rome' },
      },
      hotSeat: undefined,
    } as any);

    const saves = await listSaves({ includeAutoSave: true });

    expect(saves[0].name).toBe('Autosave Turn 9');
    expect(saves[0].kind).toBe('autosave');
  });

  it('does not include autosave when autosave rows are not requested', async () => {
    await autoSave({
      turn: 9,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);

    const saves = await listSaves();

    expect(saves.find(save => save.kind === 'autosave')).toBeUndefined();
  });

  it('keeps only the latest five autosaves for one game id', async () => {
    for (const turn of [8, 9, 10, 11, 12, 13]) {
      await autoSave({
        turn,
        currentPlayer: 'player',
        gameId: 'game-a',
        gameTitle: 'Game A',
        civilizations: {
          player: { civType: 'egypt' },
        },
        hotSeat: undefined,
      } as any);
    }

    const saves = await listSaves({ includeAutoSave: true });
    const autosaves = saves.filter(save => save.kind === 'autosave' && save.gameId === 'game-a');

    expect(autosaves.map(save => save.turn)).toEqual([13, 12, 11, 10, 9]);
  });

  it('retains autosaves separately per game id', async () => {
    await autoSave({
      turn: 7,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);
    await autoSave({
      turn: 14,
      currentPlayer: 'player',
      gameId: 'game-b',
      gameTitle: 'Game B',
      civilizations: {
        player: { civType: 'rome' },
      },
      hotSeat: undefined,
    } as any);

    const saves = await listSaves({ includeAutoSave: true });
    const gameA = saves.filter(save => save.kind === 'autosave' && save.gameId === 'game-a');
    const gameB = saves.filter(save => save.kind === 'autosave' && save.gameId === 'game-b');

    expect(gameA).toHaveLength(1);
    expect(gameB).toHaveLength(1);
    expect(gameA[0].gameTitle).toBe('Game A');
    expect(gameB[0].gameTitle).toBe('Game B');
  });

  it('groups loadable saves by game id and exposes only the newest five saves inside each epic', async () => {
    await autoSave({ turn: 12, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await autoSave({ turn: 13, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await saveGame('slot-a-14', 'Manual A14', { turn: 14, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await saveGame('slot-a-15', 'Manual A15', { turn: 15, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await saveGame('slot-a-16', 'Manual A16', { turn: 16, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await saveGame('slot-a-17', 'Manual A17', { turn: 17, gameId: 'game-a', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);
    await saveGame('slot-b', 'Manual B', { turn: 3, gameId: 'game-b', gameTitle: 'Tiny Epic', currentPlayer: 'player', civilizations: { player: { civType: 'egypt' } } } as any);
    await saveGame('slot-c', 'Manual C', { turn: 2, gameId: 'game-c', gameTitle: 'Daddy Alex', currentPlayer: 'player', civilizations: { player: { civType: 'rome' } } } as any);

    const groups = await listSaveEpics();

    expect(groups.map(group => group.gameId)).toEqual(['game-a', 'game-b', 'game-c']);
    expect(groups[0].title).toBe('Daddy Alex');
    expect(groups[0].latestTurn).toBe(17);
    expect(groups[0].saves.map(save => save.turn)).toEqual([17, 16, 15, 14, 13]);
    expect(groups[0].saves).toHaveLength(5);
    expect(groups[1].saves[0].id).toBe('slot-b');
    expect(groups[2].title).toBe('Daddy Alex');
  });

  it('deletes a single autosave entry by id without leaving it in the list', async () => {
    await autoSave({
      turn: 9,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);
    await autoSave({
      turn: 10,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);

    await deleteSaveEntry('autosave:game-a:10', 'autosave');
    const saves = await listSaves({ includeAutoSave: true });

    expect(saves.find(save => save.id === 'autosave:game-a:10')).toBeUndefined();
    expect(saves.find(save => save.id === 'autosave:game-a:9')).toBeDefined();
  });

  it('loads the newest autosave overall for continue', async () => {
    await autoSave({
      turn: 12,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);
    await autoSave({
      turn: 42,
      currentPlayer: 'player',
      gameId: 'game-b',
      gameTitle: 'Game B',
      civilizations: {
        player: { civType: 'rome' },
      },
      hotSeat: undefined,
    } as any);

    const save = await loadMostRecentAutoSave();
    expect(save?.turn).toBe(42);
    expect(save?.gameId).toBe('game-b');
  });

  it('ignores the legacy autosave fallback once a real autosave exists', async () => {
    dbState.set('autosave', {
      turn: 3,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    });

    await autoSave({
      turn: 9,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);

    const saves = await listSaves({ includeAutoSave: true });

    expect(saves.find(save => save.id === 'autosave')).toBeUndefined();
    expect(dbState.has('autosave')).toBe(false);
  });

  it('does not resurrect the legacy autosave after deleting the last real autosave', async () => {
    dbState.set('autosave', {
      turn: 3,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    });

    await autoSave({
      turn: 9,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    } as any);

    await deleteSaveEntry('autosave:game-a:9', 'autosave');

    const saves = await listSaves({ includeAutoSave: true });
    const mostRecent = await loadMostRecentAutoSave();

    expect(saves.find(save => save.id === 'autosave')).toBeUndefined();
    expect(mostRecent).toBeUndefined();
  });

  it('keeps the legacy autosave visible when autosave metadata exists without a real payload', async () => {
    const legacyState = {
      turn: 3,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    };

    dbState.set('meta:autosave:game-a:9', {
      id: 'autosave:game-a:9',
      name: 'Autosave Turn 9',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'autosave',
      gameMode: 'solo',
      gameId: 'game-a',
      gameTitle: 'Game A',
    });
    dbState.set('autosave', legacyState);

    const saves = await listSaves({ includeAutoSave: true });
    const continued = await loadMostRecentAutoSave();

    expect(saves.find(save => save.id === 'autosave')).toBeDefined();
    expect(continued?.turn).toBe(legacyState.turn);
    expect(dbState.has('meta:autosave:game-a:9')).toBe(false);
  });

  it('persists custom civilization definitions through settings save/load', async () => {
    const baseSettings = createDefaultSettings('small', (await loadSettings()) ?? {});
    await saveSettings({ ...baseSettings, customCivilizations: [customCiv] });
    const loaded = await loadSettings();
    expect(loaded?.customCivilizations?.[0].name).toBe(customCiv.name);
  });

  it('preserves same-name custom civilizations with distinct ids through settings save/load', async () => {
    const secondSunfolk: CustomCivDefinition = {
      ...customCiv,
      id: 'custom-sunfolk-2',
    };
    const baseSettings = createDefaultSettings('small', (await loadSettings()) ?? {});

    await saveSettings({ ...baseSettings, customCivilizations: [customCiv] });
    await saveSettings({
      ...baseSettings,
      customCivilizations: [customCiv, secondSunfolk],
    });

    const loaded = await loadSettings();

    expect(loaded?.customCivilizations).toEqual([customCiv, secondSunfolk]);
    expect(new Set(loaded?.customCivilizations?.map(def => def.id))).toEqual(
      new Set(['custom-sunfolk', 'custom-sunfolk-2']),
    );
  });

  it('retires the legacy autosave only after a loadable real autosave exists', async () => {
    dbState.set('autosave', {
      turn: 3,
      currentPlayer: 'player',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    });

    dbState.set('meta:autosave:game-a:9', {
      id: 'autosave:game-a:9',
      name: 'Autosave Turn 9',
      civType: 'egypt',
      turn: 9,
      lastPlayed: '2026-04-08T12:00:00.000Z',
      kind: 'autosave',
      gameMode: 'solo',
      gameId: 'game-a',
      gameTitle: 'Game A',
    });
    dbState.set('autosave:game-a:9', {
      turn: 9,
      currentPlayer: 'player',
      gameId: 'game-a',
      gameTitle: 'Game A',
      civilizations: {
        player: { civType: 'egypt' },
      },
      hotSeat: undefined,
    });

    const continued = await loadMostRecentAutoSave();

    expect(continued).toMatchObject({ gameId: 'game-a', turn: 9 });
    expect(dbState.has('autosave')).toBe(false);
  });

  it('persists council talk level through settings save/load', async () => {
    const settings = createDefaultSettings('small', { councilTalkLevel: 'chaos' });

    await saveSettings(settings);
    const loaded = await loadSettings();

    expect(loaded?.councilTalkLevel).toBe('chaos');
  });

  it('persists unit auto-explore state through save/load', async () => {
    const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true });

    await saveGame('slot-auto-explore', 'Automation Save', state);
    const loaded = await loadGame('slot-auto-explore');

    expect(loaded?.units[unitId].automation).toEqual(state.units[unitId].automation);
  });
});

// ─── migrateLegacyCoastalData ───────────────────────────────────────────────

function makeTileMigration(q: number, r: number, terrain = 'plains') {
  return {
    coord: { q, r },
    terrain: terrain as any,
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function makeCityMigration(id: string, overrides: Partial<City> = {}): City {
  return {
    id,
    name: id,
    owner: 'civ-1',
    position: { q: 5, r: 5 },
    population: 1,
    food: 0,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [{ q: 5, r: 5 }],
    workedTiles: [],
    focus: 'balanced',
    grid: [],
    gridSize: 1,
    hp: 100,
    maturity: 'core',
    ...overrides,
  } as unknown as City;
}

function makeMigrationState(cities: City[], extraTiles: ReturnType<typeof makeTileMigration>[] = []): GameState {
  const baseTiles = [
    makeTileMigration(5, 5),
    makeTileMigration(6, 5),
    makeTileMigration(4, 5),
    makeTileMigration(5, 4),
    makeTileMigration(6, 4),
    makeTileMigration(4, 6),
    makeTileMigration(5, 6),
  ];
  const tileMap = Object.fromEntries(
    [...baseTiles, ...extraTiles].map(t => [hexKey(t.coord), t]),
  );
  return {
    turn: 1,
    era: 1,
    gameId: 'migration-test',
    currentPlayer: 'civ-1',
    gameOver: false,
    winner: null,
    map: {
      width: 20,
      height: 20,
      wrapsHorizontally: false,
      rivers: [],
      tiles: tileMap,
    } as GameMap,
    units: {},
    cities: Object.fromEntries(cities.map(c => [c.id, c])),
    civilizations: {},
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: true } as any,
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('migrateLegacyCoastalData', () => {
  it('removes coastal-required ship from productionQueue of a non-coastal city', () => {
    const city = makeCityMigration('c1', { productionQueue: ['galley', 'warrior'] });
    const state = makeMigrationState([city]);
    const result = migrateLegacyCoastalData(state);
    expect(result.cities['c1'].productionQueue).toEqual(['warrior']);
  });

  it('removes coastal-required dock from city.buildings of a non-coastal city', () => {
    const city = makeCityMigration('c1', { buildings: ['dock', 'barracks'] });
    const state = makeMigrationState([city]);
    const result = migrateLegacyCoastalData(state);
    expect(result.cities['c1'].buildings).toEqual(['barracks']);
  });

  it('does not modify a genuinely coastal city', () => {
    const city = makeCityMigration('c1', { buildings: ['dock'], productionQueue: ['galley'] });
    const coastTile = makeTileMigration(6, 5, 'coast');
    const state = makeMigrationState([city], [coastTile]);
    const result = migrateLegacyCoastalData(state);
    expect(result.cities['c1'].buildings).toEqual(['dock']);
    expect(result.cities['c1'].productionQueue).toEqual(['galley']);
  });

  it('is idempotent — running twice produces the same result', () => {
    const city = makeCityMigration('c1', { productionQueue: ['galley', 'warrior'] });
    const state = makeMigrationState([city]);
    const once = migrateLegacyCoastalData(state);
    const twice = migrateLegacyCoastalData(once);
    expect(twice.cities['c1'].productionQueue).toEqual(once.cities['c1'].productionQueue);
  });

  it('returns state unchanged when no cities need migration', () => {
    const city = makeCityMigration('c1', { buildings: ['barracks'], productionQueue: ['warrior'] });
    const state = makeMigrationState([city]);
    const result = migrateLegacyCoastalData(state);
    expect(result).toBe(state);
  });
});
