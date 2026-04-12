import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { createDefaultSettings } from '@/core/game-state';
import { autoSave, deleteSaveEntry, listSaves, loadGame, loadMostRecentAutoSave, loadSettings, saveGame, saveSettings } from '@/storage/save-manager';
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
