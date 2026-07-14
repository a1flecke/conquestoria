import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { deterministicCombatSeed } from '@/systems/combat-system';
import { migrateLegacyCoastalData } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';

const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { createDefaultSettings, createNewGame } from '@/core/game-state';
import {
  autoSave,
  deleteSaveEntry,
  listSaveEpics,
  listSaves,
  loadGame,
  loadMostRecentAutoSave,
  loadMostRecentAutoSaveEntry,
  loadSaveEntry,
  loadSettings,
  normalizeLoadedStateForTest,
  rewriteLoadedSaveEntry,
  saveGame,
  saveSettings,
} from '@/storage/save-manager';
import { appendNotification } from '@/core/notification-log';
import type { CustomCivDefinition } from '@/core/types';
import { makeAutoExploreFixture } from '../systems/helpers/auto-explore-fixture';
import { dbGet } from '@/storage/db';

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

describe('save-manager setup and outcome migration', () => {
  it('runs the ordered save schema migration before legacy normalization', () => {
    const legacy = createNewGame(undefined, 'schema-load-boundary', 'small');
    delete legacy.saveSchemaVersion;
    delete legacy.gameId;

    const normalized = normalizeLoadedStateForTest(legacy);

    expect(normalized.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(normalized.gameId).toMatch(/^legacy-/);

    const first = deterministicCombatSeed(normalized.gameId, normalized.turn, 'unit-1', 'unit-2');
    const reloaded = normalizeLoadedStateForTest(structuredClone(legacy));

    expect(deterministicCombatSeed(reloaded.gameId, reloaded.turn, 'unit-1', 'unit-2')).toBe(first);
  });

  it('labels legacy geographic games historical without moving units or cities', () => {
    const legacy = createNewGame(undefined, 'legacy-geographic-placement', 'small');
    legacy.mapScript = 'earth';
    delete legacy.startPlacementMode;
    const unitPositions = Object.fromEntries(
      Object.entries(legacy.units).map(([id, unit]) => [id, structuredClone(unit.position)]),
    );
    const cityPositions = Object.fromEntries(
      Object.entries(legacy.cities).map(([id, city]) => [id, structuredClone(city.position)]),
    );

    const normalized = normalizeLoadedStateForTest(legacy);

    expect(normalized.startPlacementMode).toBe('historical');
    expect(Object.fromEntries(
      Object.entries(normalized.units).map(([id, unit]) => [id, unit.position]),
    )).toEqual(unitPositions);
    expect(Object.fromEntries(
      Object.entries(normalized.cities).map(([id, city]) => [id, city.position]),
    )).toEqual(cityPositions);
  });

  it('labels legacy generated games balanced', () => {
    const legacy = createNewGame(undefined, 'legacy-generated-placement', 'small');
    legacy.mapScript = 'single-continent';
    delete legacy.startPlacementMode;

    expect(normalizeLoadedStateForTest(legacy).startPlacementMode).toBe('balanced');
  });

  it('infers domination for legacy terminal saves with a winner', () => {
    const legacy = createNewGame(undefined, 'legacy-terminal-outcome', 'small');
    legacy.gameOver = true;
    legacy.winner = 'player';
    delete legacy.gameOverReason;

    expect(normalizeLoadedStateForTest(legacy).gameOverReason).toBe('domination');
  });
});

describe('save-manager autosave listing', () => {
  beforeEach(() => {
    dbState.clear();
    (globalThis as typeof globalThis & { localStorage?: ReturnType<typeof makeLocalStorageMock> }).localStorage = makeLocalStorageMock();
  });

  it('round-trips pirate state, viewer notifications, and repaired counters through a manual save', async () => {
    const state = createNewGame(undefined, 'pirate-save-round-trip', 'small');
    state.pirates!.activatedTurn = 20;
    state.pirates!.nextSpawnCheckTurn = 24;
    appendNotification(state, 'player', {
      message: 'Pirates sighted',
      type: 'warning',
      turn: 20,
      review: { kind: 'pirate-faction', factionId: 'pirate-2' },
    });

    await saveGame('pirate-slot', 'Pirate Save', state);
    const loaded = await loadGame('pirate-slot');

    expect(loaded?.pirates).toEqual(state.pirates);
    expect(loaded?.notificationLog).toEqual(state.notificationLog);
    expect(loaded?.idCounters.nextNotificationId).toBe(2);

    await autoSave(state);
    const autoLoaded = await loadMostRecentAutoSave();
    expect(autoLoaded?.pirates).toEqual(state.pirates);
    expect(autoLoaded?.notificationLog).toEqual(state.notificationLog);
  });

  it('loads and rewrites an exact manual source without changing metadata', async () => {
    const state = createNewGame(undefined, 'source-aware-manual', 'small');
    delete state.opponentChallenge;
    await saveGame('slot-legacy', 'Old Campaign', state);
    const source = { id: 'slot-legacy', kind: 'manual' } as const;
    const beforeMeta = structuredClone(dbState.get('meta:slot-legacy'));

    const loaded = await loadSaveEntry(source);
    expect(loaded?.source).toEqual(source);
    expect(loaded?.state.opponentChallenge).toBeUndefined();

    await rewriteLoadedSaveEntry(source, {
      ...loaded!.state,
      opponentChallenge: 'explorer',
    });

    expect(dbState.get('meta:slot-legacy')).toEqual(beforeMeta);
    expect((await loadSaveEntry(source))?.state.opponentChallenge).toBe('explorer');
  });

  it('rejects rewriting a normal source that disappeared after loading', async () => {
    const state = createNewGame(undefined, 'source-disappears', 'small');
    await saveGame('gone', 'Gone', state);
    const source = { id: 'gone', kind: 'manual' } as const;
    const loaded = await loadSaveEntry(source);
    dbState.delete('save:gone');

    await expect(rewriteLoadedSaveEntry(source, loaded!.state))
      .rejects.toThrow('Save entry no longer exists');
    expect(dbState.has('save:gone')).toBe(false);
  });

  it('returns the concrete newest autosave source for Continue', async () => {
    const state = createNewGame(undefined, 'source-aware-auto', 'small');
    state.gameId = 'game-source-aware';
    state.turn = 7;
    await autoSave(state);

    const loaded = await loadMostRecentAutoSaveEntry();

    expect(loaded?.source).toEqual({
      id: 'autosave:game-source-aware:7',
      kind: 'autosave',
    });
  });

  it('loads the concrete Continue payload before retiring the legacy fallback', async () => {
    const concrete = createNewGame(undefined, 'concurrent-concrete', 'small');
    concrete.gameId = 'concurrent';
    concrete.turn = 7;
    await autoSave(concrete);
    const legacy = createNewGame(undefined, 'concurrent-legacy', 'small');
    dbState.set('autosave', legacy);
    localStorage.setItem('conquestoria-autosave', JSON.stringify(legacy));

    const originalDbGet = vi.mocked(dbGet).getMockImplementation()!;
    let concreteReads = 0;
    vi.mocked(dbGet).mockImplementation(async key => {
      if (key === 'autosave:concurrent:7') {
        concreteReads += 1;
        if (concreteReads === 3) {
          dbState.delete(key);
          return undefined;
        }
      }
      return dbState.get(key);
    });

    try {
      const loaded = await loadMostRecentAutoSaveEntry();

      expect(loaded?.source).toEqual({
        id: 'autosave:concurrent:7',
        kind: 'autosave',
      });
      expect(loaded?.state.gameId).toBe('concurrent');
      expect(dbState.has('autosave')).toBe(true);
    } finally {
      vi.mocked(dbGet).mockImplementation(originalDbGet);
    }
  });

  it('rewrites the legacy autosave payload and localStorage backup', async () => {
    const state = createNewGame(undefined, 'source-aware-legacy', 'small');
    delete state.opponentChallenge;
    dbState.set('autosave', state);
    localStorage.setItem('conquestoria-autosave', JSON.stringify(state));

    const loaded = await loadMostRecentAutoSaveEntry();
    expect(loaded?.source).toEqual({ id: 'autosave', kind: 'autosave' });

    await rewriteLoadedSaveEntry(loaded!.source, {
      ...loaded!.state,
      opponentChallenge: 'standard',
    });

    expect((dbState.get('autosave') as GameState).opponentChallenge).toBe('standard');
    expect(JSON.parse(localStorage.getItem('conquestoria-autosave')!).opponentChallenge)
      .toBe('standard');
  });

  it('loads a localStorage-only legacy autosave with explicit source identity', async () => {
    const state = createNewGame(undefined, 'local-only-legacy', 'small');
    delete state.opponentChallenge;
    localStorage.setItem('conquestoria-autosave', JSON.stringify(state));

    const loaded = await loadMostRecentAutoSaveEntry();

    expect(loaded?.source).toEqual({ id: 'autosave', kind: 'autosave' });
    expect(loaded?.state.opponentChallenge).toBeUndefined();
  });

  it('normalizes malformed persisted notification IDs without duplicating them', () => {
    const state = createNewGame(undefined, 'notification-repair', 'small') as any;
    state.notificationLog = {
      player: [
        { id: 'notification-12', message: 'one', type: 'info', turn: 1, read: false },
        { id: 'notification-12', message: 'two', type: 'warning', turn: 2, read: false },
      ],
    };
    state.idCounters.nextNotificationId = 1;

    const normalized = normalizeLoadedStateForTest(state);
    const ids = normalized.notificationLog.player.map(entry => entry.id);

    expect(new Set(ids).size).toBe(2);
    expect(normalized.idCounters.nextNotificationId).toBeGreaterThan(12);
  });

  it('migrates legacy pirate fleets into distinct active v2 flotillas', () => {
    const state = createNewGame(undefined, 'legacy-pirate-migration', 'small') as any;
    const waterTiles = Object.values(state.map.tiles)
      .filter((tile: any) => tile.terrain === 'ocean')
      .slice(0, 3) as any[];
    expect(waterTiles).toHaveLength(3);
    state.era = 3;
    delete state.pirates;
    state.units['unit-901'] = {
      id: 'unit-901', type: 'trireme', owner: 'pirate', position: waterTiles[0].coord,
      movementPointsLeft: 2, health: 63, experience: 4, hasMoved: true, hasActed: false, isResting: false,
    };
    state.units['unit-902'] = {
      id: 'unit-902', type: 'galley', owner: 'pirate', position: waterTiles[1].coord,
      movementPointsLeft: 1, health: 88, experience: 1, hasMoved: false, hasActed: false, isResting: false,
    };
    state.units['unit-999'] = {
      id: 'unit-999', type: 'galley', owner: 'pirate', position: waterTiles[2].coord,
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const targetCityId = state.civilizations[state.currentPlayer].cities[0];
    state.pirateFleets = {
      'fleet-unit-901': {
        id: 'fleet-unit-901', unitId: 'unit-901', targetCivId: state.currentPlayer,
        targetCityId, landmassId: '0,0', era: 3, plunderCooldown: 2,
      },
      'fleet-unit-902': {
        id: 'fleet-unit-902', unitId: 'unit-902', targetCivId: state.currentPlayer,
        targetCityId, landmassId: '0,0', era: 1, plunderCooldown: 0,
      },
    };
    state.pirateFleetCooldownByCivLandmass = { [`${state.currentPlayer}:0,0`]: 20 };

    const normalized = normalizeLoadedStateForTest(state);
    const factions = Object.values(normalized.pirates.factions);

    expect(factions).toHaveLength(2);
    expect(new Set(factions.map(faction => faction.id)).size).toBe(2);
    expect(factions.map(faction => faction.headquarters.kind)).toEqual([
      'deep-sea-flotilla', 'deep-sea-flotilla',
    ]);
    expect(normalized.units['unit-901']).toMatchObject({
      owner: factions[0].id, type: 'pirate_frigate', health: 63, position: waterTiles[0].coord,
    });
    expect(normalized.units['unit-902']).toMatchObject({
      owner: factions[1].id, type: 'pirate_galley', health: 88, position: waterTiles[1].coord,
    });
    expect(normalized.units['unit-999']).toBeUndefined();
    expect(normalized.pirateFleets).toEqual({});
    expect(normalized.pirateFleetCooldownByCivLandmass).toEqual({});
    expect(normalized.pirates.activatedTurn).toBe(state.turn);
    expect(normalized.idCounters.nextPirateFactionId).toBeGreaterThan(2);

    const renormalized = normalizeLoadedStateForTest(normalized);
    expect(renormalized.pirates.factions).toEqual(normalized.pirates.factions);
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
