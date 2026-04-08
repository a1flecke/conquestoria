import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { autoSave, listSaves, saveGame } from '@/storage/save-manager';

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

    expect(saves[0].name).toBe('Autosave');
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
});
